/**
 * @fileoverview Configuration globale, constantes et dictionnaire bilingue FR/EN.
 * Projet : Drive Sleep & Green FinOps (workspace-drive-sleep)
 * Auteur : Fabrice Faucheux (FF Labs - faucheux.bzh)
 */

const CONFIGURATION_PAR_DEFAUT = Object.freeze({
  NOM_APPLICATION: 'Drive Sleep & Green FinOps',
  VERSION: '1.1.0',
  AUTEUR: 'Fabrice Faucheux',
  SITE_WEB: 'https://faucheux.bzh',
  DUREE_MAX_EXECUTION_MS: 270000, // 4 min 30 s pour respecter la limite des 6 min
  TAILLE_PAGE_DRIVE: 100,
  SEUIL_INACTIVITE_MOIS: 12,
  TAILLE_MIN_MO: 5,
  FACTEUR_CO2_KG_PAR_GO_AN: 0.2,
  COUT_GO_ANNUEL_EUR: 0.25,
  INCLURE_FICHIERS_NATIFS: 'OUI',
  POIDS_ESTIME_NATIF_MO: 2
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
  ID_CLASSEUR_MAITRE: 'ID_CLASSEUR_MAITRE',
  STATUT_CAMPAGNE: 'STATUT_CAMPAGNE'
});

const TEXTES_INTERFACE = Object.freeze({
  fr: {
    titreMenu: '🌱 Sobriété Drive',
    menuInitialiser: '1. Initialiser / Vérifier les feuilles',
    menuAudit: '2. Lancer l\'audit des fichiers dormants',
    menuNotifier: '3. Envoyer les bilans par e-mail',
    menuConsole: '4. Ouvrir la console de nettoyage',
    menuDeclencheur: '5. Activer l\'audit mensuel automatique',
    menuTests: '6. Exécuter les tests (runAllTests)',
    menuAPropos: 'À propos',
    titreConsole: 'Console de sobriété numérique',
    sousTitreConsole: 'Sélectionnez les fichiers en sommeil à placer à la corbeille (restauration possible sous 30 jours) ou à conserver en liste blanche.',
    kpiFichiers: 'Fichiers dormants',
    kpiVolume: 'Volume sélectionné',
    kpiCarbone: 'Impact carbone annuel',
    kpiSelectionnes: 'sélectionné(s)',
    uniteTaille: 'Mo',
    inactifDepuis: 'Inactif depuis :',
    btnToutSelectionner: 'Tout cocher / décocher',
    btnMettreCorbeille: 'Mettre à la corbeille',
    btnListeBlanche: 'Conserver (Liste blanche)',
    aucunFichier: 'Félicitations, aucun fichier dormant détecté sur votre périmètre !',
    chargementDonnees: 'Analyse et chargement de vos fichiers dormants…',
    traitementEnCours: 'Traitement en cours, veuillez patienter…',
    confirmationSucces: 'Traitement terminé avec succès.',
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
    menuDeclencheur: '5. Enable monthly auto-audit',
    menuTests: '6. Run unit tests (runAllTests)',
    menuAPropos: 'About',
    titreConsole: 'Digital sobriety console',
    sousTitreConsole: 'Select dormant files to move to trash (restorable within 30 days) or keep on whitelist.',
    kpiFichiers: 'Dormant files',
    kpiVolume: 'Selected volume',
    kpiCarbone: 'Annual carbon impact',
    kpiSelectionnes: 'selected',
    uniteTaille: 'MB',
    inactifDepuis: 'Inactive since:',
    btnToutSelectionner: 'Select / Deselect all',
    btnMettreCorbeille: 'Move to trash',
    btnListeBlanche: 'Keep (Whitelist)',
    aucunFichier: 'Congratulations, no dormant files detected in your scope!',
    chargementDonnees: 'Scanning and loading your dormant files…',
    traitementEnCours: 'Processing in progress, please wait…',
    confirmationSucces: 'Processing completed successfully.',
    titreModalCorbeille: 'Confirm move to trash',
    messageModalCorbeille: 'Are you sure you want to move {nb} selected file(s) ({volume}) to the trash? You can restore them from Google Drive within 30 days.',
    btnConfirmer: 'Yes, move to trash',
    btnAnnuler: 'Cancel',
    erreurServeur: 'An error occurred during the operation:',
    placeholderFiltre: 'Filter by name or type (e.g. pdf, sheet)...'
  }
});

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
 * Lit les paramètres de la feuille Configuration ou renvoie les valeurs par défaut.
 * @returns {Object} Objet contenant la configuration consolidée.
 */
function lireConfiguration() {
  const config = { ...CONFIGURATION_PAR_DEFAUT };
  try {
    const classeur = obtenirClasseurMaitre_();
    const feuille = classeur.getSheetByName(NOMS_FEUILLES.CONFIGURATION);
    if (!feuille || feuille.getLastRow() < 2) {
      return config;
    }
    const lignes = feuille.getRange(2, 1, feuille.getLastRow() - 1, 2).getValues();
    lignes.forEach(([cle, valeur]) => {
      const cleNettoyee = String(cle ?? '').trim();
      if (!cleNettoyee || valeur === '' || valeur === null) return;
      if (['SEUIL_INACTIVITE_MOIS', 'TAILLE_MIN_MO', 'FACTEUR_CO2_KG_PAR_GO_AN', 'COUT_GO_ANNUEL_EUR', 'POIDS_ESTIME_NATIF_MO'].includes(cleNettoyee)) {
        const nombre = Number(valeur);
        if (!Number.isNaN(nombre) && nombre >= 0) {
          config[cleNettoyee] = nombre;
        }
      } else {
        config[cleNettoyee] = String(valeur).trim().toUpperCase();
      }
    });
  } catch (erreur) {
    console.warn('Utilisation de la configuration par défaut :', erreur.message);
  }
  return config;
}
