import BookStore from '../../components/BookStore';
import { getBookOffer } from '../../lib/book-offer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Le livre du Hibou Rusé : montages D4, D5 et D6', description: 'Des montages atypiques, travaillés et expliqués avec des cas concrets. Découvrez quelques thèmes du guide, un exemple chiffré et l’accès au livre numérique.', alternates: { canonical: '/guide' } };
export default async function GuidePage() { return <BookStore offer={await getBookOffer()} guide/>; }
