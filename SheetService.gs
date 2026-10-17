/**
 * @fileoverview Gestion des feuilles Google Sheets, lectures/écritures groupées et KPI.
 */

/**
 * Crée et formate les 4 onglets nécessaires s'ils n'existent pas encore.
 * Enregistre l'ID du classeur maître dans PropertiesService.
 */
function initialiserEnvironnement() {
  const classeur = obtenirClasseurMaitre_();
  PropertiesService.getScriptProperties().setProperty(CLES_PROPRIETES.ID_CLASSEUR_MAITRE, classeur.getId());

  initialiserFeuilleConfiguration_(classeur);
  initialiserFeuilleInventaire_(classeur);
  initialiserFeuilleListeBlanche_(classeur);
  initialiserFeuilleTableauDeBord_(classeur);

  mettreAJourTableauDeBord();
  console.info('Environnement initialisé avec succès sur le classeur :', classeur.getId());
}

/**
 * Initialise la feuille Configuration avec les paramètres par défaut.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} classeur
 */
function initialiserFeuilleConfiguration_(classeur) {
  let feuille = classeur.getSheetByName(NOMS_FEUILLES.CONFIGURATION);
  if (!feuille) {
    feuille = classeur.insertSheet(NOMS_FEUILLES.CONFIGURATION);
    const donnees = [
      ['Paramètre / Parameter', 'Valeur / Value', 'Description (FR / EN)'],
      ['SEUIL_INACTIVITE_MOIS', CONFIGURATION_PAR_DEFAUT.SEUIL_INACTIVITE_MOIS, 'Mois sans modification ni ouverture / Months of inactivity'],
      ['TAILLE_MIN_MO', CONFIGURATION_PAR_DEFAUT.TAILLE_MIN_MO, 'Taille minimale (Mo) pour fichiers binaires / Min size (MB) for binary files'],
      ['FACTEUR_CO2_KG_PAR_GO_AN', CONFIGURATION_PAR_DEFAUT.FACTEUR_CO2_KG_PAR_GO_AN, 'Empreinte carbone (kgCO2e / Go / an) / Carbon factor (kgCO2e / GB / year)'],
      ['COUT_GO_ANNUEL_EUR', CONFIGURATION_PAR_DEFAUT.COUT_GO_ANNUEL_EUR, 'Coût financier estimé (€ / Go / an) / Storage cost (EUR / GB / year)'],
      ['INCLURE_FICHIERS_NATIFS', CONFIGURATION_PAR_DEFAUT.INCLURE_FICHIERS_NATIFS, 'Inclure Docs/Sheets/Slides sur l\'ancienneté (OUI/NON) / Include native files'],
      ['POIDS_ESTIME_NATIF_MO', CONFIGURATION_PAR_DEFAUT.POIDS_ESTIME_NATIF_MO, 'Poids forfaitaire estimé (Mo) d\'un fichier natif / Estimated native file weight (MB)']
    ];
    feuille.getRange(1, 1, donnees.length, 3).setValues(donnees);
    feuille.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e8f0fe');
    feuille.setFrozenRows(1);
    feuille.autoResizeColumns(1, 3);
  }
}

/**
 * Initialise la feuille Inventaire_Dormant.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} classeur
 */
function initialiserFeuilleInventaire_(classeur) {
  let feuille = classeur.getSheetByName(NOMS_FEUILLES.INVENTAIRE);
  if (!feuille) {
    feuille = classeur.insertSheet(NOMS_FEUILLES.INVENTAIRE);
    const enTetes = [[
      'ID_Fichier',
      'Nom',
      'Type_MIME',
      'Taille_Mo',
      'Derniere_Activite',
      'Proprietaire',
      'URL',
      'Statut',
      'Date_Traitement'
    ]];
    feuille.getRange(1, 1, 1, enTetes[0].length).setValues(enTetes).setFontWeight('bold').setBackground('#fce8e6');
    feuille.setFrozenRows(1);
  }
}

/**
 * Initialise la feuille Liste_Blanche.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} classeur
 */
function initialiserFeuilleListeBlanche_(classeur) {
  let feuille = classeur.getSheetByName(NOMS_FEUILLES.LISTE_BLANCHE);
  if (!feuille) {
    feuille = classeur.insertSheet(NOMS_FEUILLES.LISTE_BLANCHE);
    const enTetes = [['ID_Fichier_ou_Dossier', 'Nom', 'Proprietaire', 'Date_Ajout', 'Motif']];
    feuille.getRange(1, 1, 1, enTetes[0].length).setValues(enTetes).setFontWeight('bold').setBackground('#e6f4ea');
    feuille.setFrozenRows(1);
  }
}

/**
 * Initialise la feuille Tableau_de_Bord.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} classeur
 */
function initialiserFeuilleTableauDeBord_(classeur) {
  let feuille = classeur.getSheetByName(NOMS_FEUILLES.TABLEAU_DE_BORD);
  if (!feuille) {
    feuille = classeur.insertSheet(NOMS_FEUILLES.TABLEAU_DE_BORD);
    const fuseau = Session.getScriptTimeZone() || 'Europe/Paris';
    const horodatageInitial = Utilities.formatDate(new Date(), fuseau, 'dd/MM/yyyy HH:mm');
    const lignes = [
      ['Indicateur / KPI (Green IT & FinOps)', 'Valeur / Value', 'Unité / Unit'],
      ['Fichiers dormants actifs (DORMANT / NOTIFIE)', 0, 'fichiers / files'],
      ['Fichiers mis en sommeil (CORBEILLE)', 0, 'fichiers / files'],
      ['Fichiers protégés (LISTE_BLANCHE)', 0, 'fichiers / files'],
      ['Volume dormant identifié (non nettoyé)', 0, 'Go / GB'],
      ['Volume total libéré (mis à la corbeille)', 0, 'Go / GB'],
      ['Empreinte carbone évitée', 0, 'kgCO2e / an'],
      ['Économie FinOps estimée', 0, '€ / an'],
      ['Dernière mise à jour', horodatageInitial, 'JJ/MM/AAAA HH:mm']
    ];
    feuille.getRange(1, 1, lignes.length, 3).setValues(lignes);
    feuille.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e6f4ea');
    feuille.setFrozenRows(1);
    feuille.autoResizeColumns(1, 3);
  }
}

/**
 * Charge l'ensemble des ID présents dans la Liste_Blanche sous forme de Set.
 * @returns {Set<string>} Ensemble des ID protégés.
 */
function chargerIdsListeBlanche_() {
  const classeur = obtenirClasseurMaitre_();
  const feuille = classeur.getSheetByName(NOMS_FEUILLES.LISTE_BLANCHE);
  const ensemble = new Set();
  if (!feuille || feuille.getLastRow() < 2) {
    return ensemble;
  }
  const valeurs = feuille.getRange(2, 1, feuille.getLastRow() - 1, 1).getValues();
  valeurs.forEach(([id]) => {
    const idNettoye = String(id ?? '').trim();
    if (idNettoye) ensemble.add(idNettoye);
  });
  return ensemble;
}

/**
 * Charge l'ensemble des ID déjà répertoriés dans Inventaire_Dormant pour garantir l'idempotence.
 * @returns {Set<string>} Ensemble des ID déjà inventoriés.
 */
function chargerIdsInventaireExistants_() {
  const classeur = obtenirClasseurMaitre_();
  const feuille = classeur.getSheetByName(NOMS_FEUILLES.INVENTAIRE);
  const ensemble = new Set();
  if (!feuille || feuille.getLastRow() < 2) {
    return ensemble;
  }
  const valeurs = feuille.getRange(2, 1, feuille.getLastRow() - 1, 1).getValues();
  valeurs.forEach(([id]) => {
    const idNettoye = String(id ?? '').trim();
    if (idNettoye) ensemble.add(idNettoye);
  });
  return ensemble;
}

/**
 * Ajoute un lot de fichiers dormants dans la feuille Inventaire_Dormant en une seule écriture.
 * Protégé par LockService.
 * @param {Array<Array<*>>} nouvellesLignes Tableau 2D de lignes à insérer.
 * @returns {number} Nombre de lignes insérées.
 */
function enregistrerLotInventaire_(nouvellesLignes) {
  if (!Array.isArray(nouvellesLignes) || nouvellesLignes.length === 0) {
    return 0;
  }
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(15000)) {
    throw new Error('Impossible d\'acquérir le verrou d\'écriture sur l\'inventaire.');
  }
  try {
    const classeur = obtenirClasseurMaitre_();
    const feuille = classeur.getSheetByName(NOMS_FEUILLES.INVENTAIRE);
    const ligneDepart = feuille.getLastRow() + 1;
    feuille.getRange(ligneDepart, 1, nouvellesLignes.length, 9).setValues(nouvellesLignes);
    return nouvellesLignes.length;
  } finally {
    verrou.releaseLock();
  }
}

/**
 * Recalcule et met à jour les indicateurs Green IT et FinOps dans Tableau_de_Bord.
 * @returns {Object} Résumé des indicateurs calculés.
 */
function mettreAJourTableauDeBord() {
  const classeur = obtenirClasseurMaitre_();
  const feuilleInv = classeur.getSheetByName(NOMS_FEUILLES.INVENTAIRE);
  const feuilleTdb = classeur.getSheetByName(NOMS_FEUILLES.TABLEAU_DE_BORD);
  const config = lireConfiguration();

  let nbDormants = 0;
  let nbCorbeille = 0;
  let nbListeBlanche = 0;
  let moDormants = 0;
  let moLiberes = 0;

  const nbColonnes = Object.keys(COLONNES_INVENTAIRE).length;
  if (feuilleInv && feuilleInv.getLastRow() >= 2) {
    const donnees = feuilleInv.getRange(2, 1, feuilleInv.getLastRow() - 1, nbColonnes).getValues();
    donnees.forEach((ligne) => {
      const tailleMo = Number(ligne[COLONNES_INVENTAIRE.TAILLE_MO]) || 0;
      const statut = String(ligne[COLONNES_INVENTAIRE.STATUT] ?? '').trim();
      if (statut === STATUTS_FICHIER.DORMANT || statut === STATUTS_FICHIER.NOTIFIE) {
        nbDormants++;
        moDormants += tailleMo;
      } else if (statut === STATUTS_FICHIER.CORBEILLE) {
        nbCorbeille++;
        moLiberes += tailleMo;
      } else if (statut === STATUTS_FICHIER.LISTE_BLANCHE) {
        nbListeBlanche++;
      }
    });
  }

  const goDormants = Number((moDormants / 1024).toFixed(3));
  const goLiberes = Number((moLiberes / 1024).toFixed(3));
  const co2EviteKg = Number((goLiberes * config.FACTEUR_CO2_KG_PAR_GO_AN).toFixed(3));
  const economieEur = Number((goLiberes * config.COUT_GO_ANNUEL_EUR).toFixed(2));
  const fuseau = Session.getScriptTimeZone() || 'Europe/Paris';
  const horodatage = Utilities.formatDate(new Date(), fuseau, 'dd/MM/yyyy HH:mm');

  if (feuilleTdb) {
    const valeursMaj = [
      [nbDormants],
      [nbCorbeille],
      [nbListeBlanche],
      [goDormants],
      [goLiberes],
      [co2EviteKg],
      [economieEur],
      [horodatage]
    ];
    feuilleTdb.getRange(2, 2, valeursMaj.length, 1).setValues(valeursMaj);
  }

  return {
    nbDormants,
    nbCorbeille,
    nbListeBlanche,
    goDormants,
    goLiberes,
    co2EviteKg,
    economieEur
  };
}
