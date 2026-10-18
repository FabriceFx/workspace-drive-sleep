/**
 * @fileoverview Configuration globale, constantes et dictionnaire bilingue FR/EN.
 * Projet : Drive Sleep & Green FinOps (workspace-drive-sleep)
 * Auteur : Fabrice Faucheux (FF Labs - faucheux.bzh)
 * Version : 1.3.1
 */

const CONFIGURATION_PAR_DEFAUT = Object.freeze({
  NOM_APPLICATION: 'Drive Sleep & Green FinOps',
  VERSION: '1.3.2',
  AUTEUR: 'Fabrice Faucheux',
  SITE_WEB: 'https://faucheux.bzh',
  DUREE_MAX_EXECUTION_MS: 240000, // 4 min : marge de 2 min sous la limite des 6 min (écritures + KPI)
  DUREE_MAX_DECISIONS_MS: 240000, // budget d'un appel google.script.run de mise à la corbeille
  DUREE_MAX_ANALYSE_APPEL_MS: 20000, // analyse de la console : appels courts répétés par la page
  TAILLE_LOT_DECISIONS: 100, // nombre maximal d'ID traités par appel depuis la console
  TAILLE_PAGE_DRIVE: 200, // pages légères : chaque nouveau dossier coûte un appel Drive (max API : 1000)
  DUREE_LIMITE_PAGE_MS: 300000, // 5 min : au-delà, la page en cours est abandonnée puis rejouée à la reprise
  DUREE_VALIDITE_VERROU_AUDIT_MS: 6.5 * 60 * 1000,
  MAX_ECHECS_REPRISE: 3, // reprises automatiques après erreur avant abandon de la campagne
  SEUIL_INACTIVITE_MOIS: 12,
  TAILLE_MIN_MO: 5,
  FACTEUR_CO2_KG_PAR_GO_AN: 0.2,
  COUT_GO_ANNUEL_EUR: 0.25,
  INCLURE_FICHIERS_NATIFS: 'OUI',
  POIDS_ESTIME_NATIF_MO: 2,
  IGNORER_CONSULTATION: 'NON'
});

/**
 * Paramètres modifiables depuis la feuille Configuration, avec leur règle de validation.
 * Toute autre clé saisie dans la feuille est ignorée (les constantes techniques
 * comme DUREE_MAX_EXECUTION_MS ne doivent pas pouvoir être surchargées).
 */
const PARAMETRES_MODIFIABLES = Object.freeze({
  SEUIL_INACTIVITE_MOIS: { type: 'nombre', min: 1 },
  TAILLE_MIN_MO: { type: 'nombre', min: 0 },
  FACTEUR_CO2_KG_PAR_GO_AN: { type: 'nombre', min: 0 },
  COUT_GO_ANNUEL_EUR: { type: 'nombre', min: 0 },
  POIDS_ESTIME_NATIF_MO: { type: 'nombre', min: 0 },
  INCLURE_FICHIERS_NATIFS: { type: 'choix', valeurs: ['OUI', 'NON'] },
  IGNORER_CONSULTATION: { type: 'choix', valeurs: ['OUI', 'NON'] }
});

const NOMS_FEUILLES = Object.freeze({
  CONFIGURATION: 'Configuration',
  INVENTAIRE: 'Inventaire_Dormant',
  LISTE_BLANCHE: 'Liste_Blanche',
  TABLEAU_DE_BORD: 'Tableau_de_Bord'
});

const COLONNES_INVENTAIRE = Object.freeze({
  ID: 0,
  NOM: 1,
  MIME_TYPE: 2,
  TAILLE_MO: 3,
  DERNIERE_ACTIVITE: 4,
  PROPRIETAIRE: 5,
  DOSSIER_PARENT: 6,
  URL: 7,
  STATUT: 8,
  DATE_TRAITEMENT: 9
});

/** En-têtes attendus de l'onglet Inventaire_Dormant (format v1.3.1, 10 colonnes). */
const ENTETES_INVENTAIRE = Object.freeze([
  'ID_Fichier',
  'Nom',
  'Type_MIME',
  'Taille_Mo',
  'Derniere_Activite',
  'Proprietaire',
  'Dossier_Parent',
  'URL',
  'Statut',
  'Date_Traitement'
]);

/** En-têtes de l'ancien format (v1.0 à v1.3.0, 9 colonnes), reconnus pour la migration automatique. */
const ENTETES_INVENTAIRE_V1 = Object.freeze([
  'ID_Fichier', 'Nom', 'Type_MIME', 'Taille_Mo', 'Derniere_Activite', 'Proprietaire', 'URL', 'Statut', 'Date_Traitement'
]);

const COLONNES_LISTE_BLANCHE = Object.freeze({
  ID: 0,
  NOM: 1,
  PROPRIETAIRE: 2,
  DATE_AJOUT: 3,
  MOTIF: 4
});

const STATUTS_FICHIER = Object.freeze({
  DORMANT: 'DORMANT',
  NOTIFIE: 'NOTIFIE',
  CORBEILLE: 'CORBEILLE',
  LISTE_BLANCHE: 'LISTE_BLANCHE'
});

const CLES_PROPRIETES = Object.freeze({
  JETON_PAGE_DRIVE: 'JETON_PAGE_DRIVE',
  DATE_LIMITE_AUDIT: 'DATE_LIMITE_AUDIT',
  VERROU_AUDIT: 'VERROU_AUDIT',
  NOTIFIER_EN_FIN_AUDIT: 'NOTIFIER_EN_FIN_AUDIT',
  ID_CLASSEUR_MAITRE: 'ID_CLASSEUR_MAITRE',
  ADMINISTRATEURS: 'ADMINISTRATEURS',
  KPI_LIBRE_SERVICE: 'KPI_LIBRE_SERVICE',
  ECHECS_REPRISE: 'ECHECS_REPRISE',
  STATUT_CAMPAGNE: 'STATUT_CAMPAGNE'
});

/** Fonctions cibles des déclencheurs : une fonction par usage pour ne jamais supprimer le mauvais. */
const FONCTIONS_DECLENCHEURS = Object.freeze({
  REPRISE_AUDIT: 'reprendreAuditDrive',
  CAMPAGNE_MENSUELLE: 'executerCampagneMensuelle',
  ENVOI_BILANS: 'envoyerBilansCampagne',
  ANCIENNE_FONCTION: 'lancerAuditDrive' // utilisée par la v1.1 pour les deux usages, nettoyée à l'installation
});

const TEXTES_INTERFACE = Object.freeze({
  fr: {
    titreMenu: '🌱 Sobriété Drive',
    menuInitialiser: '1. Initialiser / Vérifier les feuilles',
    menuAudit: '2. Lancer l\'audit des fichiers dormants',
    menuNotifier: '3. Envoyer les bilans par e-mail',
    menuConsole: '4. Ouvrir la console (mon Drive)',
    menuDeclencheur: '5. Activer la campagne mensuelle automatique',
    menuTests: '6. Exécuter les tests (runAllTests)',
    menuAPropos: 'À propos',
    titreConsole: 'Faites le tri dans votre Drive',
    sousTitreConsole: 'Un outil simple pour retrouver de la place et alléger votre empreinte numérique.',
    accueilTitre: 'Comment ça marche ?',
    accueilPoint1: 'Nous cherchons les fichiers que vous n\'avez ni ouverts ni modifiés depuis {mois} mois.',
    accueilPoint2: 'Rien n\'est supprimé définitivement : la corbeille de Google Drive garde tout pendant 30 jours.',
    accueilPoint3: 'Vous seul voyez cette liste, et vous décidez fichier par fichier.',
    btnAnalyser: 'Analyser mon Drive',
    analyseEnCours: 'Analyse de votre Drive en cours…',
    analyseProgression: '{scannes} fichiers examinés · {trouves} en sommeil',
    btnArreter: 'Voir les résultats maintenant',
    btnContinuer: 'Continuer l\'analyse',
    analyseIncomplete: 'Analyse partielle : il reste des fichiers à examiner.',
    kpiFichiers: 'Fichiers en sommeil',
    kpiVolume: 'Volume sélectionné',
    kpiGain: 'Libéré pendant cette session',
    kpiSelectionnes: 'sélectionné(s)',
    surTotal: 'sur',
    equivalentPhotos: '≈ {n} photos',
    uniteTaille: 'Mo',
    inactifDepuis: 'Dernière activité :',
    btnToutSelectionner: 'Tout cocher / décocher',
    btnMettreCorbeille: 'Mettre à la corbeille',
    btnGarder: 'Garder',
    btnReanalyser: 'Analyser en direct',
    btnRechargerInventaire: 'Recharger l\'inventaire',
    badgeInventaire: '📋 {n} fichier(s) chargé(s) depuis l\'onglet Inventaire_Dormant.',
    aucunFichier: 'Bravo, aucun fichier en sommeil dans votre Drive !',
    aucunResultatFiltre: 'Aucun fichier ne correspond à votre recherche.',
    traitementEnCours: 'Traitement en cours, veuillez patienter…',
    corbeilleSucces: '{n} fichier(s) mis à la corbeille.',
    gardeSucces: '{n} fichier(s) gardé(s) : ils ne vous seront plus proposés.',
    annulationSucces: '{n} fichier(s) restauré(s) dans votre Drive.',
    btnAnnulerAction: 'Annuler',
    fichiersNonTraites: '{n} fichier(s) n\'ont pas pu être traités.',
    titreModalCorbeille: 'Mettre à la corbeille ?',
    messageModalCorbeille: '{nb} fichier(s) ({volume}) vont rejoindre la corbeille de Google Drive. Vous pourrez les restaurer pendant 30 jours, ou tout de suite avec le bouton « Annuler ».',
    avertissementPartages: '⚠️ {n} de ces fichiers sont partagés : les personnes qui y ont accès ne pourront plus les ouvrir.',
    badgePartage: '👥 Partagé',
    btnConfirmer: 'Oui, mettre à la corbeille',
    btnAnnuler: 'Retour',
    erreurServeur: 'Une erreur est survenue :',
    placeholderFiltre: 'Rechercher par nom ou type (ex. pdf, vidéo)…',
    ouvrir: 'Ouvrir',
    faqTitre: 'Questions fréquentes',
    faq: [
      { q: 'Puis-je récupérer un fichier ?', a: 'Oui. Juste après l\'action, cliquez sur « Annuler ». Ensuite, ouvrez Google Drive > Corbeille, faites un clic droit sur le fichier puis « Restaurer » (pendant 30 jours).' },
      { q: 'Mes collègues voient-ils mes fichiers ?', a: 'Non. L\'analyse se fait avec votre propre compte et la liste n\'est affichée qu\'à vous. Seuls des totaux anonymes (nombre de fichiers, volume libéré) sont comptabilisés.' },
      { q: 'Que se passe-t-il si je clique sur « Garder » ?', a: 'Son contenu n\'est pas modifié : une étiquette invisible est ajoutée au fichier pour qu\'il ne vous soit plus proposé lors des prochaines analyses.' },
      { q: 'Et si un fichier est partagé ?', a: 'Il est signalé par le badge « 👥 Partagé ». Si vous le mettez à la corbeille, les personnes avec qui il est partagé n\'y ont plus accès : en cas de doute, choisissez « Garder ».' },
      { q: 'Et les fichiers partagés avec moi ?', a: 'Ils ne sont jamais proposés : seuls les fichiers dont vous êtes propriétaire dans « Mon Drive » sont concernés.' }
    ]
  },
  en: {
    titreMenu: '🌱 Drive Sleep',
    menuInitialiser: '1. Initialize / Check sheets',
    menuAudit: '2. Run dormant files audit',
    menuNotifier: '3. Send email digests',
    menuConsole: '4. Open console (my Drive)',
    menuDeclencheur: '5. Enable monthly automatic campaign',
    menuTests: '6. Run unit tests (runAllTests)',
    menuAPropos: 'About',
    titreConsole: 'Tidy up your Drive',
    sousTitreConsole: 'A simple tool to free up space and lighten your digital footprint.',
    accueilTitre: 'How does it work?',
    accueilPoint1: 'We look for files you have neither opened nor edited for {mois} months.',
    accueilPoint2: 'Nothing is deleted permanently: the Google Drive trash keeps everything for 30 days.',
    accueilPoint3: 'Only you see this list, and you decide file by file.',
    btnAnalyser: 'Scan my Drive',
    analyseEnCours: 'Scanning your Drive…',
    analyseProgression: '{scannes} files checked · {trouves} dormant',
    btnArreter: 'Show results now',
    btnContinuer: 'Continue scanning',
    analyseIncomplete: 'Partial scan: some files are still to be checked.',
    kpiFichiers: 'Dormant files',
    kpiVolume: 'Selected volume',
    kpiGain: 'Freed this session',
    kpiSelectionnes: 'selected',
    surTotal: 'of',
    equivalentPhotos: '≈ {n} photos',
    uniteTaille: 'MB',
    inactifDepuis: 'Last activity:',
    btnToutSelectionner: 'Select / Deselect all',
    btnMettreCorbeille: 'Move to trash',
    btnGarder: 'Keep',
    btnReanalyser: 'Scan live Drive',
    btnRechargerInventaire: 'Reload inventory',
    badgeInventaire: '📋 {n} dormant file(s) loaded from Inventaire_Dormant sheet.',
    aucunFichier: 'Well done, no dormant files in your Drive!',
    aucunResultatFiltre: 'No file matches your search.',
    traitementEnCours: 'Processing, please wait…',
    corbeilleSucces: '{n} file(s) moved to trash.',
    gardeSucces: '{n} file(s) kept: they will not be suggested again.',
    annulationSucces: '{n} file(s) restored to your Drive.',
    btnAnnulerAction: 'Undo',
    fichiersNonTraites: '{n} file(s) could not be processed.',
    titreModalCorbeille: 'Move to trash?',
    messageModalCorbeille: '{nb} file(s) ({volume}) will be moved to the Google Drive trash. You can restore them for 30 days, or right away with the “Undo” button.',
    avertissementPartages: '⚠️ {n} of these files are shared: people who have access will no longer be able to open them.',
    badgePartage: '👥 Shared',
    btnConfirmer: 'Yes, move to trash',
    btnAnnuler: 'Back',
    erreurServeur: 'An error occurred:',
    placeholderFiltre: 'Search by name or type (e.g. pdf, video)…',
    ouvrir: 'Open',
    faqTitre: 'FAQ',
    faq: [
      { q: 'Can I get a file back?', a: 'Yes. Right after the action, click “Undo”. Later, open Google Drive > Trash, right-click the file and choose “Restore” (within 30 days).' },
      { q: 'Can my colleagues see my files?', a: 'No. The scan runs with your own account and the list is shown only to you. Only anonymous totals (number of files, freed volume) are recorded.' },
      { q: 'What does “Keep” do?', a: 'Its content is not changed: an invisible label is added so it is no longer suggested in future scans.' },
      { q: 'What if a file is shared?', a: 'It shows the “👥 Shared” badge. If you trash it, the people it is shared with lose access: when in doubt, choose “Keep”.' },
      { q: 'What about files shared with me?', a: 'They are never suggested: only files you own in “My Drive” are concerned.' }
    ]
  }
});

/** Cache de configuration pour la durée d'une exécution (évite de relire la feuille 4 à 5 fois). */
let cacheConfiguration_ = null;

/**
 * Détecte la langue de l'utilisateur actif ('fr' ou 'en').
 * @returns {string} Code langue ('fr' ou 'en').
 */
function obtenirLangueUtilisateur_() {
  try {
    const locale = Session.getActiveUserLocale() || 'fr';
    return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  } catch (erreur) {
    return 'fr';
  }
}

/**
 * Renvoie le fuseau horaire du script.
 * @returns {string} Identifiant IANA du fuseau.
 */
function obtenirFuseau_() {
  return Session.getScriptTimeZone() || 'Europe/Paris';
}

/**
 * Récupère le classeur maître (actif, ou référencé dans PropertiesService en l'absence de classeur actif).
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} Instance du classeur maître.
 */
function obtenirClasseurMaitre_() {
  const classeurActif = SpreadsheetApp.getActiveSpreadsheet();
  if (classeurActif) {
    return classeurActif;
  }
  const idClasseur = PropertiesService.getScriptProperties().getProperty(CLES_PROPRIETES.ID_CLASSEUR_MAITRE);
  if (!idClasseur) {
    throw new Error('Aucun classeur maître configuré. Exécutez d\'abord initialiserEnvironnement() depuis le Google Sheet.');
  }
  return SpreadsheetApp.openById(idClasseur);
}

/**
 * Lit les paramètres de la feuille Configuration, valide chaque valeur
 * et complète avec les valeurs par défaut. Résultat mis en cache pour l'exécution.
 * @param {boolean} [forcerRelecture=false] Ignore le cache.
 * @returns {Object} Objet contenant la configuration consolidée.
 */
function lireConfiguration(forcerRelecture = false) {
  if (cacheConfiguration_ && !forcerRelecture) {
    return cacheConfiguration_;
  }
  const config = { ...CONFIGURATION_PAR_DEFAUT };
  try {
    const classeur = obtenirClasseurMaitre_();
    const feuille = classeur.getSheetByName(NOMS_FEUILLES.CONFIGURATION);
    if (feuille && feuille.getLastRow() >= 2) {
      const lignes = feuille.getRange(2, 1, feuille.getLastRow() - 1, 2).getValues();
      lignes.forEach(([cle, valeur]) => {
        const cleNettoyee = String(cle ?? '').trim();
        const regle = PARAMETRES_MODIFIABLES[cleNettoyee];
        if (!regle || valeur === '' || valeur === null) return;
        if (regle.type === 'nombre') {
          const valeurStr = typeof valeur === 'string' ? valeur.replace(',', '.').trim() : valeur;
          const nombre = Number(valeurStr);
          if (Number.isFinite(nombre) && nombre >= regle.min) {
            config[cleNettoyee] = nombre;
          } else {
            console.warn(`Paramètre ${cleNettoyee} invalide (${valeur}), valeur par défaut conservée.`);
          }
        } else if (regle.type === 'choix') {
          const choix = String(valeur).trim().toUpperCase();
          if (regle.valeurs.includes(choix)) {
            config[cleNettoyee] = choix;
          }
        }
      });
    }
  } catch (erreur) {
    console.warn('Utilisation de la configuration par défaut :', erreur.message);
  }
  cacheConfiguration_ = Object.freeze(config);
  return cacheConfiguration_;
}

/**
 * Calcule la date limite d'inactivité (aujourd'hui moins N mois) sans débordement de fin de mois
 * (ex. 31 octobre - 8 mois = 28/29 février, et non 2/3 mars).
 * @param {number} mois Nombre de mois d'inactivité.
 * @param {Date} [reference=new Date()] Date de référence.
 * @returns {Date} Date limite.
 */
function calculerDateLimite_(mois, reference) {
  const base = reference ? new Date(reference.getTime()) : new Date();
  const jour = base.getDate();
  base.setDate(1);
  base.setMonth(base.getMonth() - Number(mois));
  const dernierJourDuMois = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(jour, dernierJourDuMois));
  return base;
}

/* ===================== Contrôle d'accès administrateur ===================== */

/**
 * Renvoie l'adresse de l'utilisateur effectif (utilisateur du menu, propriétaire pour un déclencheur).
 * @returns {string} Adresse en minuscules (vide si indisponible).
 */
function obtenirEmailEffectif_() {
  return (Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
}

/**
 * Lit la liste des administrateurs (propriété ADMINISTRATEURS, adresses séparées par des virgules).
 * @returns {Set<string>} Adresses des administrateurs.
 */
function obtenirAdministrateurs_() {
  const brut = PropertiesService.getScriptProperties().getProperty(CLES_PROPRIETES.ADMINISTRATEURS) || '';
  return new Set(brut.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

/**
 * Indique si l'utilisateur effectif est administrateur de l'outil.
 * @returns {boolean}
 */
function estAdministrateur_() {
  const email = obtenirEmailEffectif_();
  return Boolean(email) && obtenirAdministrateurs_().has(email);
}

/**
 * Bloque l'exécution si l'utilisateur n'est pas administrateur. Toutes les fonctions publiques
 * (non suffixées par _) sont appelables par google.script.run depuis la console par tout éditeur
 * du classeur : les fonctions d'administration doivent donc se protéger elles-mêmes.
 * Amorçage : tant qu'aucun administrateur n'est enregistré, le premier utilisateur capable
 * d'ouvrir le classeur maître (donc éditeur ou propriétaire) est enregistré comme administrateur.
 */
function exigerAdministrateur_() {
  if (estAdministrateur_()) return;
  const email = obtenirEmailEffectif_();
  if (email && obtenirAdministrateurs_().size === 0) {
    const classeur = obtenirClasseurMaitre_();
    const proprietaire = classeur.getOwner() ? classeur.getOwner().getEmail().toLowerCase() : '';
    const editeurs = classeur.getEditors().map((utilisateur) => utilisateur.getEmail().toLowerCase());
    if (email !== proprietaire && !editeurs.includes(email)) {
      throw new Error('Seul un éditeur du classeur maître peut initialiser l\'outil. / Only an editor of the master sheet can initialize the tool.');
    }
    PropertiesService.getScriptProperties().setProperty(CLES_PROPRIETES.ADMINISTRATEURS, email);
    console.info(`Premier administrateur enregistré : ${email}`);
    return;
  }
  throw new Error('Fonction réservée aux administrateurs de Drive Sleep. / Administrators only.');
}
