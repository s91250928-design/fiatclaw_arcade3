/* Настройки терминала. Меняются без пересборки. */
window.TERM_CONFIG = {
  // true — тестовая сеть Hyperliquid, false — основная.
  isTestnet: true,

  // Адрес строителя: кошелёк, на который приходит наша комиссия.
  // На его счёте Hyperliquid должно быть не меньше 100 USDC.
  builder: "0xa02a1872ebbf3a5d2f0d8b236ef16f0fe62b16d0",

  // Комиссия терминала в десятых долях базисного пункта: 25 = 0,025%; 10 = 0,01%.
  feeTenthBps: 25,

  // Допуск цены для рыночных сделок: 0.01 = 1%.
  slippage: 0.01,

  // Вход по QR-коду (WalletConnect): бесплатный Project ID с dashboard.reown.com.
  // В настройках проекта на Reown добавьте домен сайта в список разрешённых.
  walletConnectProjectId: "9b3a84ea477e53175b664630b9b2a11b",

  // Подтверждение для сделок от этой суммы, $.
  confirmAboveUsd: 1000,
};
