import BookStore from '../../components/BookStore';
import { getBookOffer } from '../../lib/book-offer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Le livre du Hibou Rusé : montages, extraits et sommaire', description: 'Les montages que vous n’auriez pas pensé à chercher. Parcourez un vrai cas chiffré, des extraits et le sommaire du guide numérique avant d’acheter.', alternates: { canonical: '/guide' } };
export default async function GuidePage() { return <BookStore offer={await getBookOffer()} guide/>; }
