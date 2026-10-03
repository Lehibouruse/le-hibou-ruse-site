import { cache } from 'react';
import { block, configMap, getAllRecords, getRecords, TABLES } from './airtable';
import { commercialReadiness } from './launch-readiness.mjs';
import { publicBookModel } from './book-marketing.mjs';

export const getBookOffer = cache(async () => {
  const [cms, products, configuration, chapters, legal] = await Promise.all([
    getRecords(TABLES.cms), getRecords(TABLES.products),
    getAllRecords(TABLES.configuration, { maxRecords: 500 }).catch(() => []),
    getAllRecords(TABLES.book, { maxRecords: 500 }).catch(() => []),
    getRecords(TABLES.legal),
  ]);
  const config = configMap(configuration);
  const product = products.find((record) => record.fields.Actif)?.fields || {};
  const readiness = commercialReadiness({ config, product, chapters, legal });
  const rawPrice = Number(product['Prix €'] || config.ebook_price || 29);
  const price = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : 29;
  return {
    price, priceLabel: new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(price),
    ready: readiness.ready, purchaseUrl: readiness.ready ? '/achat-guide' : '',
    earlyAccess: readiness.earlyAccess, edition: config.book_current_edition || '',
    deliveryProvider: readiness.deliveryProvider,
    hero: block(cms, 'hero'), footer: block(cms, 'footer'),
    ...publicBookModel(chapters),
  };
});
