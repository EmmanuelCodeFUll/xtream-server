const http = require('http');
const https = require('https');
const url = require('url');

const M3U_URL = 'https://mi-lista-iptv.netlify.app/MiLista_Verificada.m3u';
const USERNAME = 'nemis';
const PASSWORD = 'blackedge2026';
const PORT = process.env.PORT || 3000;

let cachedStreams = [];
let lastFetch = 0;

function fetchAndParse(callback) {
    const now = Date.now();
    if (cachedStreams.length > 0 && (now - lastFetch) < 3600000) {
        return callback(null, cachedStreams);
    }
    
    console.log('Downloading M3U...');
    https.get(M3U_URL, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
            console.log('M3U downloaded, size: ' + data.length);
            const lines = data.split(/\r?\n/);
            const streams = [];
            let id = 1;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('#EXTINF')) {
                    const nextLine = lines[i+1] ? lines[i+1].trim() : '';
                    if (nextLine && !nextLine.startsWith('#') && nextLine.length > 5) {
                        const nameMatch = line.match(/,(.+)$/);
                        const logoMatch = line.match(/tvg-logo="([^"]*)"/);
                        const groupMatch = line.match(/group-title="([^"]*)"/);
                        
                        streams.push({
                            num: id,
                            name: nameMatch ? nameMatch[1].trim() : 'Canal ' + id,
                            stream_type: "live",
                            stream_id: id,
                            stream_icon: logoMatch ? logoMatch[1] : '',
                            epg_channel_id: '',
                            added: '1609459200',
                            category_id: '1',
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
            
            console.log('Parsed ' + streams.length + ' channels');
            cachedStreams = streams;
            lastFetch = now;
            callback(null, streams);
        });
    }).on('error', err => {
        console.log('Error: ' + err.message);
        callback(err);
    });
}

// Pre-load on startup
fetchAndParse((err, streams) => {
    if (err) console.log('Startup load failed: ' + err.message);
    else console.log('Startup: loaded ' + streams.length + ' channels');
});

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    const query = parsedUrl.query;
    const auth = query.username === USERNAME && query.password === PASSWORD;

    if (path === '/get.php') {
        if (!auth) { res.writeHead(401); return res.end('Unauthorized'); }
        https.get(M3U_URL, (m3uRes) => {
            res.writeHead(200, { 'Content-Type': 'application/x-mpegurl' });
            m3uRes.pipe(res);
        }).on('error', e => { res.writeHead(500); res.end('Error'); });
    }
    else if (path === '/player_api.php') {
        if (!auth) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ user_info: { auth: 0 } }));
        }

        const action = query.action;

        if (!action) {
            const info = {
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
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(info));
        }

        if (action === 'get_live_categories') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify([
                { category_id: "1", category_name: "Todos los Canales", parent_id: 0 }
            ]));
        }

        if (action === 'get_live_streams') {
            fetchAndParse((err, streams) => {
                if (err) { res.writeHead(500); return res.end('[]'); }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(streams));
            });
            return;
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