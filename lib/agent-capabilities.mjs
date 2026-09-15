const fn = (name, description, properties = {}, required = []) => ({
  type: "function", name, description, strict: true,
  parameters: { type: "object", additionalProperties: false, properties, required },
});
const str = (description) => ({ type: "string", description });

export const AGENTIC_ACTIONS = new Set(["UPDATE_SITE", "CREATE_VIDEO"]);

const SOCIAL_NETWORKS = ["youtube", "instagram", "facebook", "threads", "tiktok", "linkedin", "pinterest", "x"];

const socialPublishTool = (provider) => fn(
  `publish_${provider}`,
  `Préparer ou publier via la passerelle officielle ${provider}. Le runner impose les garde-fous du Job, social_test_mode, revue humaine et idempotence; le modèle ne peut pas forcer un live.`,
  {
    media_url: str("URL HTTPS publique du média principal"),
    caption: str("Texte ou légende"),
    title: str("Titre, chaîne vide si non pertinent"),
    privacy_level: str("private, unlisted, SELF_ONLY, public ou chaîne vide selon provider"),
    cover_image_url: str("URL HTTPS de couverture, utile notamment pour Pinterest vidéo; chaîne vide sinon"),
    board_id: str("Board Pinterest si pertinent; chaîne vide sinon"),
    content_record_id: str("ID Content Pipeline rec... pour attribution et persistance; chaîne vide si absent"),
  },
  ["media_url", "caption", "title", "privacy_level", "cover_image_url", "board_id", "content_record_id"],
);

const READ_TOOLS = [
  fn("airtable_read", "Lire jusqu'à 20 enregistrements d'une table métier autorisée.", {
    table: str("cms, benchmark, content, articles, products ou montages"),
    record_id: str("ID rec... précis, ou chaîne vide pour lister"),
    limit: { type: "integer", minimum: 1, maximum: 20 },
  }, ["table", "record_id", "limit"]),
  fn("social_status", "Lire l'état réel de la passerelle sociale et du coffre OAuth, sans jamais renvoyer de secret."),
  fn("social_prepare", "Préparer et valider une publication sociale en dry-run uniquement.", {
    provider: str("youtube, instagram, facebook, threads, tiktok, linkedin, pinterest, x ou snapchat"),
    media_url: str("URL HTTPS publique du média"),
    caption: str("Texte/caption proposé"),
    title: str("Titre proposé, chaîne vide si non pertinent"),
    privacy_level: str("Niveau de confidentialité demandé, chaîne vide pour le défaut sûr"),
  }, ["provider", "media_url", "caption", "title", "privacy_level"]),
  fn("repo_list", "Lister les fichiers versionnés du site."),
  fn("repo_read", "Lire un fichier texte autorisé du site.", { path: str("Chemin relatif") }, ["path"]),
  fn("repo_read_many", "Lire en une fois jusqu'à 12 fichiers texte du site pour éviter des tours redondants.", {
    paths: { type: "array", minItems: 1, maxItems: 12, items: str("Chemin relatif") },
  }, ["paths"]),
  fn("git_diff", "Inspecter les modifications locales du job."),
];

const SOCIAL_PUBLISH_TOOLS = SOCIAL_NETWORKS.map(socialPublishTool);

const SITE_TOOLS = [
  ...READ_TOOLS,
  ...SOCIAL_PUBLISH_TOOLS,
  fn("site_write", "Créer ou remplacer un fichier du site sous app/, components/ ou public/. Les API, workflows, dépendances et secrets sont hors périmètre.", {
    path: str("Chemin relatif sous app/, components/ ou public/"),
    content: str("Contenu complet sans secret"),
  }, ["path", "content"]),
  fn("site_edit", "Modifier de façon ciblée un fichier existant. old_text doit apparaître exactement une fois; préférable à une réécriture complète.", {
    path: str("Chemin relatif sous app/, components/ ou public/"), old_text: str("Texte exact à remplacer"), new_text: str("Texte de remplacement"),
  }, ["path", "old_text", "new_text"]),
  fn("run_tests", "Exécuter les tests du dépôt."),
  fn("run_build", "Exécuter le build de production."),
  fn("propose_changes", "Pousser une branche propre au job et créer une PR après tests/build. Une fusion automatique exige en plus parameters.merge_authorization=true et un preview Vercel réussi.", {
    message: str("Message de commit descriptif"),
  }, ["message"]),
];

const VIDEO_TOOLS = [
  ...READ_TOOLS,
  ...SOCIAL_PUBLISH_TOOLS,
  fn("generate_image", "Générer un visuel de scène via OpenAI sous public/generated/<job>/.", {
    prompt: str("Description visuelle"), path: str("Chemin PNG autorisé sous public/generated/"),
  }, ["prompt", "path"]),
  fn("generate_speech", "Produire une voix via OpenAI sous public/generated/<job>/.", {
    text: str("Narration, 4096 caractères maximum"), voice: str("Voix OpenAI"), path: str("Chemin MP3 autorisé"),
  }, ["text", "voice", "path"]),
  fn("generate_music", "Créer localement une nappe musicale originale sans achat.", {
    duration_seconds: { type: "number", minimum: 2, maximum: 90 }, mood: str("Ambiance"), path: str("Chemin WAV autorisé"),
  }, ["duration_seconds", "mood", "path"]),
  fn("assemble_video", "Assembler les scènes, la voix, la musique et les sous-titres en MP4 9:16 local. Ne publie sur aucun réseau sans autorisation explicite du Job.", {
    scenes: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", additionalProperties: false, properties: {
      image_path: str("Image locale"), duration_seconds: { type: "number", minimum: 1, maximum: 15 }, caption: str("Sous-titre"),
    }, required: ["image_path", "duration_seconds", "caption"] } },
    voice_path: str("Voix locale"), music_path: str("Musique locale ou chaîne vide"), output_path: str("MP4 sous public/generated/"),
  }, ["scenes", "voice_path", "music_path", "output_path"]),
  fn("video_qc", "Contrôler techniquement le brouillon: MP4 lisible, vidéo 1080x1920, piste audio, durée et taille cohérentes.", {
    video_path: str("MP4 sous public/generated/"),
  }, ["video_path"]),
  fn("run_tests", "Exécuter les tests du dépôt."),
  fn("run_build", "Exécuter le build de production."),
  fn("register_video_draft", "Pousser l'artefact sur une branche dédiée et enregistrer son lien dans la fiche Content Pipeline. Force l'attente humaine tant que le Job n'autorise pas explicitement la publication.", {
    record_id: str("ID Content Pipeline"), video_path: str("MP4 sous public/generated/"), notes: str("Résumé du rendu"),
    branch: str("Laisser vide: le runner injecte sa branche dédiée."),
  }, ["record_id", "video_path", "notes", "branch"]),
];

export function toolsForAction(action) {
  return action === "CREATE_VIDEO" ? VIDEO_TOOLS : SITE_TOOLS;
}

export function isAgenticAction(action, parameters = {}) {
  return AGENTIC_ACTIONS.has(action) && (action !== "UPDATE_SITE" || !parameters.key);
}

export function workerInstructions(action) {
  const common = `Utilise plusieurs outils si nécessaire et contrôle chaque résultat. Aucun secret, achat, paiement ou KYC. Les outils publish_* passent obligatoirement par la passerelle sociale serveur: ils restent dry-run tant que le Job n'a pas publication_authorization=true ET human_approved=true, et social_test_mode/revue humaine/idempotence restent prioritaires. Ne prétends jamais qu'une publication a réussi sans ID/résultat réel de l'API. Les écritures sont bornées au job. Tests et build doivent réussir avant toute proposition. Termine par un JSON strict: {"status":"completed|failed|waiting_for_human","result":"...","confidence":0.0}.`;
  return action === "CREATE_VIDEO"
    ? `${common}\nProduis le MP4 vertical et exécute video_qc. En configuration/test, utilise social_prepare ou publish_* qui seront forcés en dry-run/private par les politiques. Une publication publique n'est permise que si le Job et la politique serveur l'autorisent explicitement. Après register_video_draft, termine waiting_for_human si une validation est encore requise.`
    : `${common}\nUPDATE_SITE est ici une mission globale: parameters.key n'est pas requis. Lis le contexte Airtable puis utilise repo_read_many pour les fichiers centraux. Préfère site_edit pour modifier l'existant et évite les réécritures intégrales redondantes. Fais un lot cohérent d'améliorations, puis enchaîne sans perfectionnisme git_diff, tests, build et propose_changes. La fusion automatique n'est autorisée qu'après tests, build, périmètre, contrôle Vercel et merge_authorization=true.`;
}
