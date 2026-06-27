// api/github.js — GitHub MCP proxy for Claude custom connector
// Allows Claude to read/write files in the bunana repo via a PAT stored in env vars.
// MCP-compatible: accepts JSON-RPC 2.0 requests over HTTP POST.

const GITHUB_API = 'https://api.github.com';
const REPO = 'preethishdev/bunana';
const BRANCH = 'main';

function jsonrpc(id, result) {
  return { jsonrpc: '2.0', id, result };
}
function jsonrpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

const TOOLS = [
  {
    name: 'get_file',
    description: 'Read a file from the bunana GitHub repo',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path in repo, e.g. index.html' }
      },
      required: ['path']
    }
  },
  {
    name: 'put_file',
    description: 'Create or update a file in the bunana GitHub repo',
    inputSchema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'File path in repo, e.g. index.html' },
        content: { type: 'string', description: 'Full UTF-8 file content' },
        message: { type: 'string', description: 'Commit message' }
      },
      required: ['path', 'content', 'message']
    }
  },
  {
    name: 'list_files',
    description: 'List files in a directory of the bunana repo',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path, e.g. api or empty string for root' }
      },
      required: []
    }
  }
];

async function githubRequest(method, endpoint, body) {
  const pat = process.env.GITHUB_PAT;
  if (!pat) throw new Error('GITHUB_PAT env var not set');

  const res = await fetch(`${GITHUB_API}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'bunana-claude-connector'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { message: text }; }
  if (!res.ok) throw new Error(data.message || `GitHub API error ${res.status}`);
  return data;
}

async function handleTool(name, args) {
  if (name === 'get_file') {
    const data = await githubRequest('GET', `/repos/${REPO}/contents/${args.path}?ref=${BRANCH}`);
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return { content: [{ type: 'text', text: content }], sha: data.sha };
  }

  if (name === 'put_file') {
    // Get current SHA if file exists (needed for updates)
    let sha;
    try {
      const existing = await githubRequest('GET', `/repos/${REPO}/contents/${args.path}?ref=${BRANCH}`);
      sha = existing.sha;
    } catch { /* file doesn't exist yet, that's fine */ }

    const encoded = Buffer.from(args.content, 'utf8').toString('base64');
    const body = {
      message: args.message,
      content: encoded,
      branch: BRANCH,
      ...(sha ? { sha } : {})
    };
    const data = await githubRequest('PUT', `/repos/${REPO}/contents/${args.path}`, body);
    return { content: [{ type: 'text', text: `✅ Committed: ${data.commit.sha.slice(0,7)} — ${args.message}` }] };
  }

  if (name === 'list_files') {
    const p = args.path || '';
    const data = await githubRequest('GET', `/repos/${REPO}/contents/${p}?ref=${BRANCH}`);
    const list = Array.isArray(data)
      ? data.map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.path}`).join('\n')
      : data.name;
    return { content: [{ type: 'text', text: list }] };
  }

  throw new Error(`Unknown tool: ${name}`);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // MCP discovery endpoint
  if (req.method === 'GET') {
    return res.json({
      name: 'bunana-github',
      version: '1.0.0',
      description: 'GitHub read/write access for the bunana repo',
      tools: TOOLS
    });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { jsonrpc: ver, id, method, params } = req.body || {};

  // MCP initialize
  if (method === 'initialize') {
    return res.json(jsonrpc(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'bunana-github', version: '1.0.0' }
    }));
  }

  // List available tools
  if (method === 'tools/list') {
    return res.json(jsonrpc(id, { tools: TOOLS }));
  }

  // Call a tool
  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    try {
      const result = await handleTool(name, args || {});
      return res.json(jsonrpc(id, result));
    } catch (err) {
      return res.json(jsonrpcError(id, -32000, err.message));
    }
  }

  return res.json(jsonrpcError(id, -32601, `Method not found: ${method}`));
}
