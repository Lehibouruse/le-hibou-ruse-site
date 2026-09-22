const fn = (name, description, properties = {}, required = []) => ({
  type: "function", name, description, strict: true,
  parameters: { type: "object", additionalProperties: false, properties, required },
});
const str = (description) => ({ type: "string", description });

export const AGENTIC_ACTIONS = new Set(["UPDATE_SITE", "CREATE_VIDEO", "REGENERATE_SCENE"]);

const READ_TOOLS = [
  fn("airtable_read", "Lire jusqu'à 20 enregistrements d'une table métier autorisée.", {
    table: str("cms, benchmark, content, articles, products, montages, video_scenes ou video_profiles"),
    record_id: str("ID rec... précis, ou chaîne vide pour lister"),
    limit: { type: "integer", minimum: 1, maximum: 50 },
  }, ["table", "record_id", "limit"]),
  fn("social_status", "Lire l'état de la passerelle sociale, les providers configurés et les variables manquantes. Ne renvoie jamais les secrets."),
  fn("social_prepare", "Préparer et valider un plan de publication sociale en dry-run uniquement. Ne publie jamais.", {
    provider: str("youtube, instagram, facebook, tiktok, linkedin, threads, pinterest, x ou snapchat"),
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

const SITE_TOOLS = [
  ...READ_TOOLS,
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
  fn("scene_save", "Créer ou mettre à jour une scène vidéo dans Airtable. scene_json est un objet JSON sérialisé et borné au Content Pipeline du Job.", {
    scene_json: str("JSON avec record_id éventuel, order, narration, visual_concept, prompt, screen_text, owl, shot_type, duration_seconds, zoom_percent, anchor, music_cue, candidates, selected_path, qc_score, qc_reason, regenerations, status, profile_record_id"),
  }, ["scene_json"]),
  fn("video_state", "Mettre à jour l'état machine de la production vidéo ciblée.", {
    state: str("PLANNING, GENERATING, VISUAL_QC, RENDERING, FINAL_QC, HUMAN_REVIEW, READY ou ERROR"),
    notes: str("Note courte de progression"),
  }, ["state", "notes"]),
  fn("visual_qc", "Évaluer UNE image candidate par vision: adéquation sémantique, lisibilité mobile, cohérence de style et artefacts. Comparer ensuite les scores entre candidats.", {
    image_path: str("Chemin local de l'image candidate"),
    narration: str("Phrase de narration couverte"),
    visual_concept: str("Idée visuelle attendue"),
    style_lock: str("Style lock appliqué"),
  }, ["image_path", "narration", "visual_concept", "style_lock"]),
  fn("prune_media", "Supprimer les candidats rejetés avant enregistrement final pour ne pas gonfler Git. Ne conserve que les chemins explicitement fournis.", {
    prefix: str("Répertoire public/generated/<job>/"),
    keep_paths: { type: "array", minItems: 1, maxItems: 30, items: str("Chemin média à conserver") },
  }, ["prefix", "keep_paths"]),
  fn("generate_image", "Générer un visuel de scène via OpenAI sous public/generated/<job>/.", {
    prompt: str("Description visuelle"), path: str("Chemin PNG autorisé sous public/generated/"),
  }, ["prompt", "path"]),
  fn("generate_speech", "Produire une voix via OpenAI sous public/generated/<job>/.", {
    text: str("Narration, 4096 caractères maximum"), voice: str("Voix OpenAI"), path: str("Chemin MP3 autorisé"),
  }, ["text", "voice", "path"]),
  fn("generate_music", "Créer localement une nappe musicale originale sans achat.", {
    duration_seconds: { type: "number", minimum: 2, maximum: 90 }, mood: str("Ambiance"), path: str("Chemin WAV autorisé"),
  }, ["duration_seconds", "mood", "path"]),
  fn("assemble_video", "Assembler 15 à 25 scènes sélectionnées, voix, musique éventuelle et textes courts en MP4 9:16. Chaque plan reçoit un micro-zoom stable sans tremblement.", {
    scenes: { type: "array", minItems: 1, maxItems: 25, items: { type: "object", additionalProperties: false, properties: {
      image_path: str("Image locale retenue"),
      duration_seconds: { type: "number", minimum: 1, maximum: 15 },
      caption: str("Texte écran court, idéalement 2 à 7 mots"),
      zoom_percent: { type: "number", minimum: 0, maximum: 6 },
      anchor: str("centre, gauche, droite, haut ou bas"),
    }, required: ["image_path", "duration_seconds", "caption", "zoom_percent", "anchor"] } },
    voice_path: str("Voix locale"), music_path: str("Musique locale autorisée ou chaîne vide"), output_path: str("MP4 sous public/generated/"),
  }, ["scenes", "voice_path", "music_path", "output_path"]),
  fn("video_qc", "Contrôler techniquement le brouillon: MP4 lisible, vidéo 1080x1920, piste audio, durée et taille cohérentes.", {
    video_path: str("MP4 sous public/generated/"),
  }, ["video_path"]),
  fn("run_tests", "Exécuter les tests du dépôt."),
  fn("run_build", "Exécuter le build de production."),
  fn("register_video_draft", "Pousser le master et ses images sur une branche hibou-review non déployée par Vercel, puis enregistrer le master dans Content Pipeline. Force l'attente humaine et interdit la publication.", {
    record_id: str("ID Content Pipeline"), video_path: str("MP4 sous public/generated/"), notes: str("Résumé du rendu"),
    branch: str("Laisser vide: le runner injecte sa branche dédiée."),
  }, ["record_id", "video_path", "notes", "branch"]),
];

export function toolsForAction(action) {
  return ["CREATE_VIDEO", "REGENERATE_SCENE"].includes(action) ? VIDEO_TOOLS : SITE_TOOLS;
}

export function isAgenticAction(action, parameters = {}) {
  return AGENTIC_ACTIONS.has(action) && (action !== "UPDATE_SITE" || !parameters.key);
}

export function workerInstructions(action) {
  const common = `Utilise plusieurs outils si nécessaire et contrôle chaque résultat. Aucun secret, achat, paiement ou KYC. social_status et social_prepare sont autorisés mais social_prepare reste strictement en dry-run: aucune publication sociale live depuis ce worker. Les écritures sont bornées au job. Tests et build doivent réussir avant toute proposition. Termine par un JSON strict: {"status":"completed|failed|waiting_for_human","result":"...","confidence":0.0}.`;
  if (action === "CREATE_VIDEO") return `${common}\nPIPELINE VIDEO V2 OBLIGATOIRE. 1) Lis la fiche Content Pipeline ciblée puis le profil actif video_profiles (par défaut HIBOU_VIRAL_V1). Passe video_state à PLANNING. 2) Découpe le script en 15 à 25 scènes de 1,5 à 2,5 s: UNE idée = UNE image; storytelling visuel > mascotte > décoration > texte. Enregistre chaque scène avec scene_save avant génération. 3) Pour chaque scène, écris un prompt spécifique = idée visuelle + style lock; le Hibou n'apparaît que s'il sert l'histoire. Génère 2 à 3 candidats selon le profil, dans des chemins distincts. 4) Appelle visual_qc sur chaque candidat; garde le meilleur seulement si score >= seuil du profil (80 par défaut), sinon régénère au maximum deux fois. Sauvegarde score, motif, candidats et selected_path via scene_save. 5) Quand toutes les scènes sont validées, produis UNE voix française grave/naturelle. Ne génère aucune imitation de Dynasty. Master sans musique commerciale par défaut; n'utilise generate_music que si parameters.preview_original_music=true. 6) Assemble uniquement les images retenues, avec captions de 2 à 7 mots, cuts francs, zoom stable 2-4 %, sans mouvement aléatoire. 7) Passe FINAL_QC, appelle video_qc, puis tests et build. 8) register_video_draft doit pousser uniquement sur hibou-review (jamais de merge, jamais de Vercel), puis video_state HUMAN_REVIEW. Aucune publication. Termine waiting_for_human.`;
  if (action === "REGENERATE_SCENE") return `${common}\nLis la scène ciblée dans video_scenes et son profil. Ne touche à aucune autre scène. Génère 2 à 3 nouveaux candidats avec le même style lock, note chacun via visual_qc, conserve le meilleur au-dessus du seuil et mets à jour uniquement cette scène avec scene_save. Ne publie rien et ne modifie pas le site. Termine waiting_for_human.`;
  return `${common}\nUPDATE_SITE est ici une mission globale: parameters.key n'est pas requis. Lis le contexte Airtable puis utilise repo_read_many pour les fichiers centraux. Préfère site_edit pour modifier l'existant et évite les réécritures intégrales redondantes. Fais un lot cohérent d'améliorations, puis enchaîne sans perfectionnisme git_diff, tests, build et propose_changes. La fusion automatique n'est autorisée qu'après tests, build, périmètre, contrôle Vercel et merge_authorization=true.`;
}
