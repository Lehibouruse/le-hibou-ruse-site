import BookStore from '../components/BookStore';
import { getBookOffer } from '../lib/book-offer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { alternates: { canonical: '/' }, description: 'Découvrez les montages du Hibou Rusé : entreprise, rémunération, patrimoine, D4, D5 et D6. Un cas chiffré, quelques thèmes du guide et un accès direct à l’achat.' };
export default async function Home() { return <BookStore offer={await getBookOffer()}/>; }
