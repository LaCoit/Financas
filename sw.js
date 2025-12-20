const CACHE_NAME = 'my-financas-v14-db-fix'; // Mudei a versão para forçar atualização
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon.png'
];

// Instalação: Baixa os arquivos novos
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Força o SW a ativar imediatamente
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

// Ativação: Limpa os caches antigos (Importante para remover a versão v13)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('Removendo cache antigo:', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// Intercepta os pedidos: Serve o cache se existir, senão busca na net
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});