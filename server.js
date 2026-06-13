const http = require('http');
const https = require('https');
const url = require('url');

const M3U_URL = 'https://mi-lista-iptv.netlify.app/MiLista_Verificada.m3u';
const USERNAME = 'nemis';
const PASSWORD = 'blackedge2026';
const PORT = process.env.PORT || 3000;

let cachedStreams = [];
let cachedCategories = [];
let lastFetch = 0;

function fetchAndParse(callback) {
    const now = Date.now();
    if (cachedStreams.length > 0 && (now - lastFetch) < 3600000) {
        return callback(null, cachedStreams, cachedCategories);
    }
    https.get(M3U_URL, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
            const lines = data.split(/\r?\n/);
            const streams = [];
            const groupMap = {};
            let groupId = 1;
            let id = 1;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('#EXTINF')) {
                    const nextLine = lines[i+1] ? lines[i+1].trim() : '';
                    if (nextLine && !nextLine.startsWith('#') && nextLine.length > 5) {
                        const nameMatch = line.match(/,(.+)$/);
                        const logoMatch = line.match(/tvg-logo="([^"]*)"/);
                        const groupMatch = line.match(/group-title="([^"]*)"/);
                        const groupName = groupMatch ? groupMatch[1] : 'General';
                        if (!groupMap[groupName]) groupMap[groupName] = groupId++;
                        streams.push({
                            num: id,
                            name: nameMatch ? nameMatch[1].trim() : 'Canal ' + id,
                            stream_type: "live",
                            stream_id: id,
                            stream_icon: logoMatch ? logoMatch[1] : '',
                            epg_channel_id: '',
                            added: '1609459200',
                            category_id: String(groupMap[groupName]),
                            custom_sid: '',
                            tv_archive: 0,
                            direct_source: nextLine,
                            tv_archive_duration: 0
                        });
                        id++;
                        i++;
                    }
                }
            }
            const categories = Object.entries(groupMap).map(([name, catId]) => ({
                category_id: String(catId),
                category_name: name,
                parent_id: 0
            }));
            cachedStreams = streams;
            cachedCategories = categories;
            lastFetch = now;
            callback(null, streams, categories);
        });
    }).on('error', err => callback(err));
}

fetchAndParse((err, s, c) => {
    if (!err) console.log('Loaded ' + s.length + ' channels, ' + c.length + ' categories');
});

function proxyStream(streamUrl, res) {
    try {
        const parsedUrl = new URL(streamUrl);
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        };
        const lib = parsedUrl.protocol === 'https:' ? https : http;
        const proxyReq = lib.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });
        proxyReq.on('error', () => { res.writeHead(500); res.end(); });
        proxyReq.end();
    } catch(e) {
        res.writeHead(500);
        res.end();
    }
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    const query = parsedUrl.query;
    const auth = query.username === USERNAME && query.password === PASSWORD;

    // Stream endpoint: /live/nemis/blackedge2026/ID.ts
    const streamMatch = path.match(/^\/live\/([^\/]+)\/([^\/]+)\/(\d+)\.(ts|m3u8)$/);
    if (streamMatch) {
        const user = streamMatch[1];
        const pass = streamMatch[2];
        const streamId = parseInt(streamMatch[3]);
        if (user !== USERNAME || pass !== PASSWORD) {
            res.writeHead(401); return res.end('Unauthorized');
        }
        fetchAndParse((err, streams) => {
            if (err) { res.writeHead(500); return res.end(); }
            const channel = streams.find(s => s.stream_id === streamId);
            if (!channel) { res.writeHead(404); return res.end('Not found'); }
            proxyStream(channel.direct_source, res);
        });
        return;
    }

    if (path === '/get.php') {
        if (!auth) { res.writeHead(401); return res.end('Unauthorized'); }
        https.get(M3U_URL, (m3uRes) => {
            res.writeHead(200, { 'Content-Type': 'application/x-mpegurl' });
            m3uRes.pipe(res);
        }).on('error', e => { res.writeHead(500); res.end(); });
    }
    else if (path === '/player_api.php') {
        if (!auth) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ user_info: { auth: 0 } }));
        }
        const action = query.action;
        if (!action) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                user_info: {
                    username: USERNAME, password: PASSWORD,
                    message: "Mi Lista IPTV", auth: 1, status: "Active",
                    exp_date: "2556143999", is_trial: "0",
                    active_cons: "1", created_at: "1609459200",
                    max_connections: "5",
                    allowed_output_formats: ["m3u8", "ts", "rtmp"]
                },
                server_info: {
                    url: "xtream-server.onrender.com", port: "80",
                    https_port: "443", server_protocol: "http",
                    rtmp_port: "25462", timezone: "America/New_York",
                    timestamp_now: Math.floor(Date.now() / 1000),
                    time_now: new Date().toISOString()
                }
            }));
        }
        if (action === 'get_live_categories') {
            fetchAndParse((err, s, cats) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(err ? [] : cats));
            });
            return;
        }
        if (action === 'get_live_streams') {
            fetchAndParse((err, streams) => {
                if (err) { res.writeHead(500); return res.end('[]'); }
                const host = 'xtream-server.onrender.com';
                const mapped = streams.map(s => ({
                    ...s,
                    direct_source: `http://${host}/live/${USERNAME}/${PASSWORD}/${s.stream_id}.ts`
                }));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(mapped));
            });
            return;
        }
        if (action === 'get_short_epg' || action === 'get_simple_data_table') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ epg_listings: [] }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('[]');
    }
    else {
        res.writeHead(200);
        res.end('Server OK - Channels: ' + cachedStreams.length);
    }
});

server.listen(PORT, () => console.log('Server on port ' + PORT));