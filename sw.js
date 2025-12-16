const CACHE_NAME = 'financas-v1';
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js'
];

// 1. Instalação: Baixa os arquivos para o cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Cache aberto');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Requisição: Se estiver sem net, usa o cache
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Se achou no cache, retorna o cache. Se não, tenta a internet.
      return response || fetch(event.request);
    })
  );
});

// 3. Atualização: Limpa caches antigos se mudar a versão
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});