/* Service worker — La Melodia della Memoria (PWA).
   Cache versionada. Subir CACHE a cada mudança do shell, senão o celular
   continua com o arquivo velho. O mp3 não entra no pré-cache: é guardado
   depois do primeiro play (ficheiro completo) e, offline, pedidos Range
   são atendidos com 206 a partir dessa cópia completa. */
const CACHE = 'lmdm-pwa-v8';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/acesso.js',
  './icons-marca/icon-192.png',
  './icons-marca/icon-512.png',
  './icons-marca/icon-512-maskable.png',
  './icons-marca/apple-touch-icon.png',
  './icons-marca/favicon-32.png',
  './icons-marca/favicon-16.png',
  './icons-marca/favicon.ico',
  './img/logo-disco.webp',
  './img/logo-cervello.webp',
  './img/logo-cervello-2x.webp',
  './img/artwork.webp',
  './fonts/lora-400.woff2',
  './fonts/lora-600.woff2',
  './fonts/lora-700.woff2',
  './fonts/opensans-400.woff2',
  './fonts/opensans-600.woff2',
  './fonts/opensans-700.woff2',
  './fonts/opensans-800.woff2'
];

const AUDIO_PATH = '/media/melodia_della_memoria_15min_192k.mp3';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) {
        return Promise.allSettled(
          PRECACHE.map(function (u) {
            return c.add(new Request(u, { cache: 'reload' }));
          })
        );
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE && k.indexOf('lmdm-pwa-') === 0; })
          .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

function isAudioRequest(url) {
  try {
    var u = new URL(url, self.location.href);
    return u.origin === self.location.origin && u.pathname.endsWith(AUDIO_PATH) ||
      (u.origin === self.location.origin && /melodia_della_memoria_15min_192k\.mp3$/.test(u.pathname));
  } catch (err) {
    return false;
  }
}

function parseRange(header, size) {
  if (!header || !/^bytes=/.test(header)) return null;
  var p = header.replace('bytes=', '').split('-');
  var start = p[0] === '' ? NaN : Number(p[0]);
  var end = p[1] === '' || p[1] == null ? size - 1 : Number(p[1]);
  if (!Number.isFinite(start) && Number.isFinite(end)) {
    start = Math.max(0, size - end);
    end = size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= size || start > end) {
    return null;
  }
  return { start: start, end: end };
}

async function respondAudio(request) {
  var cache = await caches.open(CACHE);
  var cached = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
  if (!cached) {
    /* Tenta o pedido sem Range, pelo caminho canónico. */
    cached = await cache.match(new Request(new URL(request.url, self.location.href).pathname, { method: 'GET' }), { ignoreSearch: true });
  }
  if (!cached) {
    var list = await cache.keys();
    for (var i = 0; i < list.length; i++) {
      if (/melodia_della_memoria_15min_192k\.mp3$/.test(new URL(list[i].url).pathname)) {
        cached = await cache.match(list[i]);
        break;
      }
    }
  }

  if (cached) {
    var range = parseRange(request.headers.get('Range'), 0);
    var buf = await cached.arrayBuffer();
    var size = buf.byteLength;
    range = parseRange(request.headers.get('Range'), size);
    if (!range) {
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
          'Content-Length': String(size),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=0'
        }
      });
    }
    var slice = buf.slice(range.start, range.end + 1);
    return new Response(slice, {
      status: 206,
      headers: {
        'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Length': String(slice.byteLength),
        'Content-Range': 'bytes ' + range.start + '-' + range.end + '/' + size,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=0'
      }
    });
  }

  try {
    var res = await fetch(request);
    if (res && res.ok && res.status === 200) {
      cache.put(request, res.clone()).catch(function () {});
    }
    return res;
  } catch (err) {
    return new Response('', { status: 503, statusText: 'Offline, audio not cached' });
  }
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  if (/melodia_della_memoria_15min_192k\.mp3$/.test(url.pathname)) {
    e.respondWith(respondAudio(req));
    return;
  }

  e.respondWith(
    caches.open(CACHE).then(async function (cache) {
      try {
        var res = await fetch(req);
        if (res && res.ok) {
          cache.put(req, res.clone()).catch(function () {});
        }
        return res;
      } catch (err) {
        var hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') {
          var idx = await cache.match('./index.html', { ignoreSearch: true }) ||
                    await cache.match('./', { ignoreSearch: true }) ||
                    await cache.match('/index.html', { ignoreSearch: true });
          if (idx) return idx;
        }
        return Response.error();
      }
    })
  );
});
