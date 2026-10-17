/**
 * @fileoverview Configuration globale, constantes et dictionnaire bilingue FR/EN.
 * Projet : Drive Sleep & Green FinOps (workspace-drive-sleep)
 * Auteur : Fabrice Faucheux (FF Labs - faucheux.bzh)
 * Version : 1.2.0
 */

const CONFIGURATION_PAR_DEFAUT = Object.freeze({
  NOM_APPLICATION: 'Drive Sleep & Green FinOps',
  VERSION: '1.2.0',
  AUTEUR: 'Fabrice Faucheux',
  SITE_WEB: 'https://faucheux.bzh',
  DUREE_MAX_EXECUTION_MS: 240000, // 4 min : marge de 2 min sous la limite des 6 min (écritures + KPI)
  DUREE_MAX_DECISIONS_MS: 240000, // budget d'un appel google.script.run de mise à la corbeille
  TAILLE_LOT_DECISIONS: 100, // nombre maximal d'ID traités par appel depuis la console
  TAILLE_PAGE_DRIVE: 500, // Drive API v3 accepte jusqu'à 1000
  DUREE_VALIDITE_VERROU_AUDIT_MS: 6.5 * 60 * 1000,
  SEUIL_INACTIVITE_MOIS: 12,
  TAILLE_MIN_MO: 5,
  FACTEUR_CO2_KG_PAR_GO_AN: 0.2,
  COUT_GO_ANNUEL_EUR: 0.25,
  INCLURE_FICHIERS_NATIFS: 'OUI',
  POIDS_ESTIME_NATIF_MO: 2
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
  INCLURE_FICHIERS_NATIFS: { type: 'choix', valeurs: ['OUI', 'NON'] }
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
  URL: 6,
  STATUT: 7,
  DATE_TRAITEMENT: 8
});

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
  STATUT_CAMPAGNE: 'STATUT_CAMPAGNE'
});

/** Fonctions cibles des déclencheurs : une fonction par usage pour ne jamais supprimer le mauvais. */
const FONCTIONS_DECLENCHEURS = Object.freeze({
  REPRISE_AUDIT: 'reprendreAuditDrive',
  CAMPAGNE_MENSUELLE: 'executerCampagneMensuelle',
  ANCIENNE_FONCTION: 'lancerAuditDrive' // utilisée par la v1.1 pour les deux usages, nettoyée à l'installation
});

const TEXTES_INTERFACE = Object.freeze({
  fr: {
    titreMenu: '🌱 Sobriété Drive',
    menuInitialiser: '1. Initialiser / Vérifier les feuilles',
    menuAudit: '2. Lancer l\'audit des fichiers dormants',
    menuNotifier: '3. Envoyer les bilans par e-mail',
    menuConsole: '4. Ouvrir la console de nettoyage',
    menuDeclencheur: '5. Activer la campagne mensuelle automatique',
    menuTests: '6. Exécuter les tests (runAllTests)',
    menuAPropos: 'À propos',
    titreConsole: 'Console de sobriété numérique',
    sousTitreConsole: 'Sélectionnez les fichiers en sommeil à placer à la corbeille (restauration possible sous 30 jours) ou à conserver en liste blanche.',
    kpiFichiers: 'Fichiers dormants',
    kpiVolume: 'Volume sélectionné',
    kpiCarbone: 'Impact carbone annuel',
    kpiSelectionnes: 'sélectionné(s)',
    surTotal: 'sur un total de',
    parAnEconomises: 'par an économisés',
    uniteTaille: 'Mo',
    inactifDepuis: 'Inactif depuis :',
    btnToutSelectionner: 'Tout cocher / décocher (fichiers affichés)',
    btnMettreCorbeille: 'Mettre à la corbeille',
    btnListeBlanche: 'Conserver (Liste blanche)',
    aucunFichier: 'Félicitations, aucun fichier dormant détecté sur votre périmètre !',
    aucunResultatFiltre: 'Aucun fichier ne correspond à votre filtre.',
    chargementDonnees: 'Analyse et chargement de vos fichiers dormants…',
    traitementEnCours: 'Traitement en cours, veuillez patienter…',
    confirmationSucces: 'Traitement terminé avec succès.',
    fichiersTraites: 'fichier(s) traité(s)',
    fichiersNonTraites: 'fichier(s) non traité(s) — réessayez ou vérifiez vos droits',
    titreModalCorbeille: 'Confirmation de mise à la corbeille',
    messageModalCorbeille: 'Êtes-vous certain de vouloir déplacer les {nb} fichier(s) sélectionné(s) ({volume}) à la corbeille ? Vous disposerez de 30 jours pour les restaurer depuis Google Drive.',
    btnConfirmer: 'Oui, mettre à la corbeille',
    btnAnnuler: 'Annuler',
    erreurServeur: 'Une erreur est survenue lors de l\'opération :',
    placeholderFiltre: 'Filtrer par nom ou type (ex. pdf, sheet)...'
  },
  en: {
    titreMenu: '🌱 Drive Sleep',
    menuInitialiser: '1. Initialize / Check sheets',
    menuAudit: '2. Run dormant files audit',
    menuNotifier: '3. Send email digests',
    menuConsole: '4. Open cleanup console',
    menuDeclencheur: '5. Enable monthly automatic campaign',
    menuTests: '6. Run unit tests (runAllTests)',
    menuAPropos: 'About',
    titreConsole: 'Digital sobriety console',
    sousTitreConsole: 'Select dormant files to move to trash (restorable within 30 days) or keep on whitelist.',
    kpiFichiers: 'Dormant files',
    kpiVolume: 'Selected volume',
    kpiCarbone: 'Annual carbon impact',
    kpiSelectionnes: 'selected',
    surTotal: 'out of',
    parAnEconomises: 'saved per year',
    uniteTaille: 'MB',
    inactifDepuis: 'Inactive since:',
    btnToutSelectionner: 'Select / Deselect all (displayed files)',
    btnMettreCorbeille: 'Move to trash',
    btnListeBlanche: 'Keep (Whitelist)',
    aucunFichier: 'Congratulations, no dormant files detected in your scope!',
    aucunResultatFiltre: 'No file matches your filter.',
    chargementDonnees: 'Scanning and loading your dormant files…',
    traitementEnCours: 'Processing in progress, please wait…',
    confirmationSucces: 'Processing completed successfully.',
    fichiersTraites: 'file(s) processed',
    fichiersNonTraites: 'file(s) not processed — retry or check your permissions',
    titreModalCorbeille: 'Confirm move to trash',
    messageModalCorbeille: 'Are you sure you want to move {nb} selected file(s) ({volume}) to the trash? You can restore them from Google Drive within 30 days.',
    btnConfirmer: 'Yes, move to trash',
    btnAnnuler: 'Cancel',
    erreurServeur: 'An error occurred during the operation:',
    placeholderFiltre: 'Filter by name or type (e.g. pdf, sheet)...'
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
 * Récupère le classeur maître (actif ou référencé dans PropertiesService pour la Web App).
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
          const nombre = Number(valeur);
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
