import BookStore from '../components/BookStore';
import { getBookOffer } from '../lib/book-offer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { alternates: { canonical: '/' }, description: 'Découvrez les montages du Hibou Rusé : entreprise, rémunération et patrimoine. Un vrai cas chiffré, des extraits gratuits et le sommaire du guide numérique.' };
export default async function Home() { return <BookStore offer={await getBookOffer()}/>; }
