import { StoreHeader, StoreFooter, ServiceOffers } from '../../components/BookStore';
import { BookAction } from '../../components/BookExperience';
import LeadForm from '../../components/LeadForm';

export const metadata = { title: 'Montages spécifiques et sur mesure | Le Hibou Rusé', description: 'Montages spécifiques : 500 €. Montage sur mesure : sur devis. Le Hibou étudie les combinaisons qui sortent des réponses standard.', alternates: { canonical: '/services' } };
export default async function ServicesPage({ searchParams }) {
  const params = await searchParams;
  const selected = params?.offre === 'selection' ? 'selection' : params?.offre === 'sur-mesure' ? 'sur-mesure' : '';
  return <div className="store store-assertive"><StoreHeader/><main className="store-wrap store-services-page" id="main-content"><div className="store-service-intro"><p className="store-overline">MONTAGES SPÉCIFIQUES · SUR MESURE</p><h1>Le prêt-à-penser<br/><em>ne suffit pas.</em></h1><p className="store-lead">Un objectif précis ? Un montage atypique ? Le Hibou creuse votre sujet, compare les scénarios et met les chiffres sur la table.</p><BookAction href="/guide" secondary placement="services-back-book">Découvrir le livre · 29 €</BookAction></div><ServiceOffers standalone/><section className="store-service-form" id="demande"><p className="store-overline">PARLEZ-NOUS DE VOTRE CAS</p><h2>{selected === 'sur-mesure' ? 'Demander un devis.' : selected === 'selection' ? 'Demander une sélection de montages.' : 'Qu’est-ce que vous voulez creuser ?'}</h2><p>Décrivez le sujet. Le périmètre est confirmé avant toute commande.</p><LeadForm initialOffer={selected}/></section></main><StoreFooter/></div>;
}
