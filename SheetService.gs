/**
 * @fileoverview Gestion des feuilles Google Sheets, lectures/écritures groupées et KPI.
 * Projet : Drive Sleep & Green FinOps (workspace-drive-sleep)
 * Auteur : Fabrice Faucheux (FF Labs - faucheux.bzh)
 */

/**
 * Crée et formate les 4 onglets nécessaires s'ils n'existent pas encore
 * et enregistre l'ID du classeur maître dans PropertiesService.
 * Les actions visibles (suppression de la feuille vierge, activation du tableau de bord)
 * ne sont faites qu'à la demande explicite, jamais depuis un déclencheur.
 * @param {Object} [options]
 * @param {boolean} [options.depuisMenu=false] Active le nettoyage de la feuille vierge et la navigation.
 */
function initialiserEnvironnement(options = {}) {
  exigerAdministrateur_();
  const depuisMenu = options && options.depuisMenu === true;
  const classeur = obtenirClasseurMaitre_();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(CLES_PROPRIETES.ID_CLASSEUR_MAITRE) !== classeur.getId()) {
    props.setProperty(CLES_PROPRIETES.ID_CLASSEUR_MAITRE, classeur.getId());
  }

  initialiserFeuilleConfiguration_(classeur);
  initialiserFeuilleInventaire_(classeur);
  initialiserFeuilleListeBlanche_(classeur);
  initialiserFeuilleTableauDeBord_(classeur);

  if (depuisMenu) {
    supprimerFeuilleInitialeSiVierge_(classeur);
    mettreAJourTableauDeBord();
    const feuilleTdb = classeur.getSheetByName(NOMS_FEUILLES.TABLEAU_DE_BORD);
    if (feuilleTdb) {
      classeur.setActiveSheet(feuilleTdb);
    }
  }

  console.info('Environnement vérifié sur le classeur :', classeur.getId());
}

/**
 * Supprime la feuille par défaut ('Feuille 1', 'Sheet1'…) uniquement si elle est totalement vide.
 * Une feuille au nom personnalisé n'est jamais supprimée, même vide.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} classeur
 */
function supprimerFeuilleInitialeSiVierge_(classeur) {
  const feuillesRequises = new Set(Object.values(NOMS_FEUILLES));
  classeur.getSheets().forEach((feuille) => {
    const nom = feuille.getName();
    if (feuillesRequises.has(nom)) return;
    const estNomParDefaut = /^(feuille|sheet)\s*\d*$/i.test(nom.trim());
    const estVide = feuille.getLastRow() === 0 && feuille.getLastColumn() === 0;
    if (estNomParDefaut && estVide && classeur.getSheets().length > 1) {
      try {
        classeur.deleteSheet(feuille);
        console.info(`Feuille initiale vierge '${nom}' supprimée.`);
      } catch (erreur) {
        console.warn(`Impossible de supprimer la feuille '${nom}' :`, erreur.message);
      }
    }
  });
}

/**
 * Initialise la feuille Configuration avec les paramètres par défaut.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} classeur
 */
function initialiserFeuilleConfiguration_(classeur) {
  if (classeur.getSheetByName(NOMS_FEUILLES.CONFIGURATION)) return;
  const feuille = classeur.insertSheet(NOMS_FEUILLES.CONFIGURATION);
  const donnees = [
    ['Paramètre / Parameter', 'Valeur / Value', 'Description (FR / EN)'],
    ['SEUIL_INACTIVITE_MOIS', CONFIGURATION_PAR_DEFAUT.SEUIL_INACTIVITE_MOIS, 'Mois sans modification ni ouverture (min. 1) / Months of inactivity (min. 1)'],
    ['TAILLE_MIN_MO', CONFIGURATION_PAR_DEFAUT.TAILLE_MIN_MO, 'Taille minimale (Mo) pour fichiers binaires / Min size (MB) for binary files'],
    ['FACTEUR_CO2_KG_PAR_GO_AN', CONFIGURATION_PAR_DEFAUT.FACTEUR_CO2_KG_PAR_GO_AN, 'Empreinte carbone (kgCO2e / Go / an) / Carbon factor (kgCO2e / GB / year)'],
    ['COUT_GO_ANNUEL_EUR', CONFIGURATION_PAR_DEFAUT.COUT_GO_ANNUEL_EUR, 'Coût financier estimé (€ / Go / an) / Storage cost (EUR / GB / year)'],
    ['INCLURE_FICHIERS_NATIFS', CONFIGURATION_PAR_DEFAUT.INCLURE_FICHIERS_NATIFS, 'Inclure Docs/Sheets/Slides sur l\'ancienneté (OUI/NON) / Include native files (OUI/NON)'],
    ['POIDS_ESTIME_NATIF_MO', CONFIGURATION_PAR_DEFAUT.POIDS_ESTIME_NATIF_MO, 'Poids de repli (Mo) si Drive ne renvoie pas quotaBytesUsed / Fallback weight (MB)']
  ];
  feuille.getRange(1, 1, donnees.length, 3).setValues(donnees);
  feuille.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e8f0fe');
  feuille.setFrozenRows(1);
  feuille.autoResizeColumns(1, 3);
}

/**
 * Initialise la feuille Inventaire_Dormant (dates stockées en vraies dates, formatées JJ/MM/AAAA).
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} classeur
 */
function initialiserFeuilleInventaire_(classeur) {
  let feuille = classeur.getSheetByName(NOMS_FEUILLES.INVENTAIRE);
  const enTetes = [[
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
  ]];
  if (!feuille) {
    feuille = classeur.insertSheet(NOMS_FEUILLES.INVENTAIRE);
    feuille.getRange(1, 1, 1, enTetes[0].length).setValues(enTetes).setFontWeight('bold').setBackground('#fce8e6');
    feuille.getRange('E:E').setNumberFormat('dd/MM/yyyy');
    feuille.getRange('J:J').setNumberFormat('dd/MM/yyyy');
    feuille.setFrozenRows(1);
    return;
  }
  // Migration automatique si la colonne Dossier_Parent est absente de la feuille existante
  const colDossier = Object.keys(COLONNES_INVENTAIRE).length;
  if (feuille.getLastColumn() < colDossier) {
    const enTetesActuels = feuille.getRange(1, 1, 1, Math.max(feuille.getLastColumn(), 1)).getValues()[0].map(String);
    if (!enTetesActuels.some((h) => /dossier/i.test(h))) {
      feuille.insertColumnAfter(COLONNES_INVENTAIRE.PROPRIETAIRE + 1);
      feuille.getRange(1, COLONNES_INVENTAIRE.DOSSIER_PARENT + 1).setValue('Dossier_Parent').setFontWeight('bold').setBackground('#fce8e6');
      feuille.getRange('J:J').setNumberFormat('dd/MM/yyyy');
      console.info('Colonne Dossier_Parent insérée dans Inventaire_Dormant existant.');
    }
  }
}

/**
 * Initialise la feuille Liste_Blanche.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} classeur
 */
function initialiserFeuilleListeBlanche_(classeur) {
  if (classeur.getSheetByName(NOMS_FEUILLES.LISTE_BLANCHE)) return;
  const feuille = classeur.insertSheet(NOMS_FEUILLES.LISTE_BLANCHE);
  const enTetes = [['ID_Fichier_ou_Dossier', 'Nom', 'Proprietaire', 'Date_Ajout', 'Motif']];
  feuille.getRange(1, 1, 1, enTetes[0].length).setValues(enTetes).setFontWeight('bold').setBackground('#e6f4ea');
  feuille.getRange('D:D').setNumberFormat('dd/MM/yyyy');
  feuille.setFrozenRows(1);
}

/**
 * Initialise la feuille Tableau_de_Bord.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} classeur
 */
function initialiserFeuilleTableauDeBord_(classeur) {
  if (classeur.getSheetByName(NOMS_FEUILLES.TABLEAU_DE_BORD)) return;
  const feuille = classeur.insertSheet(NOMS_FEUILLES.TABLEAU_DE_BORD);
  const lignes = [
    ['Indicateur / KPI (Green IT & FinOps)', 'Valeur / Value', 'Unité / Unit'],
    ['Fichiers dormants actifs (DORMANT / NOTIFIE)', 0, 'fichiers / files'],
    ['Fichiers mis en sommeil (CORBEILLE)', 0, 'fichiers / files'],
    ['Fichiers protégés (LISTE_BLANCHE)', 0, 'fichiers / files'],
    ['Volume dormant identifié (non nettoyé)', 0, 'Go / GB'],
    ['Volume mis à la corbeille (libéré sous 30 j)', 0, 'Go / GB'],
    ['Empreinte carbone évitée (inventaire + console)', 0, 'kgCO2e / an'],
    ['Économie FinOps estimée (inventaire + console)', 0, '€ / an'],
    ['Dernière mise à jour', new Date(), 'JJ/MM/AAAA HH:mm']
  ];
  feuille.getRange(1, 1, lignes.length, 3).setValues(lignes);
  feuille.getRange(9, 2).setNumberFormat('dd/MM/yyyy HH:mm');
  feuille.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e6f4ea');
  feuille.setFrozenRows(1);
  feuille.autoResizeColumns(1, 3);
}

/**
 * Lit la première colonne (ID) d'une feuille sous forme de Set.
 * @param {string} nomFeuille Nom de la feuille.
 * @returns {Set<string>} Ensemble des ID non vides.
 */
function lireIdsFeuille_(nomFeuille) {
  const feuille = obtenirClasseurMaitre_().getSheetByName(nomFeuille);
  const ensemble = new Set();
  if (!feuille || feuille.getLastRow() < 2) {
    return ensemble;
  }
  feuille.getRange(2, 1, feuille.getLastRow() - 1, 1).getValues().forEach(([id]) => {
    const idNettoye = String(id ?? '').trim();
    if (idNettoye) ensemble.add(idNettoye);
  });
  return ensemble;
}

/**
 * Charge l'ensemble des ID présents dans la Liste_Blanche.
 * @returns {Set<string>} Ensemble des ID protégés.
 */
function chargerIdsListeBlanche_() {
  return lireIdsFeuille_(NOMS_FEUILLES.LISTE_BLANCHE);
}

/**
 * Charge l'ensemble des ID déjà répertoriés dans Inventaire_Dormant (idempotence de l'audit).
 * @returns {Set<string>} Ensemble des ID déjà inventoriés.
 */
function chargerIdsInventaireExistants_() {
  return lireIdsFeuille_(NOMS_FEUILLES.INVENTAIRE);
}

/**
 * Lit toutes les lignes de l'inventaire (sans l'en-tête).
 * @returns {Array<Array<*>>} Lignes de l'inventaire.
 */
function lireLignesInventaire_() {
  const feuille = obtenirClasseurMaitre_().getSheetByName(NOMS_FEUILLES.INVENTAIRE);
  if (!feuille || feuille.getLastRow() < 2) {
    return [];
  }
  const nbColonnes = Object.keys(COLONNES_INVENTAIRE).length;
  return feuille.getRange(2, 1, feuille.getLastRow() - 1, nbColonnes).getValues();
}

/**
 * Ajoute un lot de fichiers dormants dans Inventaire_Dormant en une seule écriture.
 * Protégé par LockService.
 * @param {Array<Array<*>>} nouvellesLignes Tableau 2D de lignes à insérer.
 * @returns {number} Nombre de lignes insérées.
 */
function enregistrerLotInventaire_(nouvellesLignes) {
  if (!Array.isArray(nouvellesLignes) || nouvellesLignes.length === 0) {
    return 0;
  }
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(30000)) {
    throw new Error('Impossible d\'acquérir le verrou d\'écriture sur l\'inventaire.');
  }
  try {
    const feuille = obtenirClasseurMaitre_().getSheetByName(NOMS_FEUILLES.INVENTAIRE);
    const nbColonnes = Object.keys(COLONNES_INVENTAIRE).length;
    feuille.getRange(feuille.getLastRow() + 1, 1, nouvellesLignes.length, nbColonnes).setValues(nouvellesLignes);
    SpreadsheetApp.flush();
    return nouvellesLignes.length;
  } finally {
    verrou.releaseLock();
  }
}

/**
 * Met à jour le statut (et éventuellement la date de traitement) de lignes identifiées par leur ID.
 * Relit la feuille sous verrou et n'écrit que les colonnes Statut et Date_Traitement :
 * aucune écriture concurrente (audit, autre utilisateur) n'est écrasée.
 * L'appelant doit détenir le verrou de script.
 * @param {Map<string, {statut: string, date?: Date}>} majParId Mises à jour indexées par ID.
 * @param {string[]} statutsModifiables Statuts actuels autorisés à être remplacés.
 * @returns {Set<string>} ID effectivement mis à jour.
 */
function appliquerStatutsParId_(majParId, statutsModifiables) {
  const idsMisAJour = new Set();
  const feuille = obtenirClasseurMaitre_().getSheetByName(NOMS_FEUILLES.INVENTAIRE);
  if (!feuille || feuille.getLastRow() < 2 || majParId.size === 0) {
    return idsMisAJour;
  }
  const nbLignes = feuille.getLastRow() - 1;
  const ids = feuille.getRange(2, COLONNES_INVENTAIRE.ID + 1, nbLignes, 1).getValues();
  const plageStatuts = feuille.getRange(2, COLONNES_INVENTAIRE.STATUT + 1, nbLignes, 2);
  const statuts = plageStatuts.getValues();

  ids.forEach(([id], index) => {
    const idNettoye = String(id ?? '').trim();
    const maj = majParId.get(idNettoye);
    if (!maj) return;
    const statutActuel = String(statuts[index][0] ?? '').trim();
    if (!statutsModifiables.includes(statutActuel)) return;
    statuts[index][0] = maj.statut;
    if (maj.date) {
      statuts[index][1] = maj.date;
    }
    idsMisAJour.add(idNettoye);
  });

  if (idsMisAJour.size > 0) {
    plageStatuts.setValues(statuts);
  }
  return idsMisAJour;
}

/**
 * Synchronise l'inventaire avec l'état réel de Google Drive :
 * vérifie les fichiers actuellement au statut DORMANT ou NOTIFIE
 * et bascule automatiquement à CORBEILLE ceux qui ont été placés à la corbeille.
 * @returns {number} Nombre de lignes mises à jour vers CORBEILLE.
 */
function synchroniserStatutsCorbeilleInventaire_() {
  const classeur = obtenirClasseurMaitre_();
  const feuilleInv = classeur.getSheetByName(NOMS_FEUILLES.INVENTAIRE);
  if (!feuilleInv || feuilleInv.getLastRow() < 2) return 0;

  const nbColonnes = Object.keys(COLONNES_INVENTAIRE).length;
  const plage = feuilleInv.getRange(2, 1, feuilleInv.getLastRow() - 1, nbColonnes);
  const lignes = plage.getValues();
  const idsActifs = new Set();

  lignes.forEach((ligne) => {
    const id = String(ligne[COLONNES_INVENTAIRE.ID] ?? '').trim();
    const statut = String(ligne[COLONNES_INVENTAIRE.STATUT] ?? '').trim();
    if (id && (statut === STATUTS_FICHIER.DORMANT || statut === STATUTS_FICHIER.NOTIFIE)) {
      idsActifs.add(id);
    }
  });

  if (idsActifs.size === 0) return 0;

  const idsEnCorbeille = new Set();
  try {
    let jeton = null;
    do {
      const options = {
        q: "trashed = true and 'me' in owners",
        pageSize: 1000,
        fields: 'nextPageToken, files(id)',
        includeItemsFromAllDrives: false,
        supportsAllDrives: true
      };
      if (jeton) options.pageToken = jeton;
      const reponse = executerAvecRetry_(() => Drive.Files.list(options));
      (reponse.files || []).forEach((f) => {
        if (idsActifs.has(f.id)) {
          idsEnCorbeille.add(f.id);
        }
      });
      jeton = reponse.nextPageToken || null;
    } while (jeton && idsEnCorbeille.size < idsActifs.size);
  } catch (erreur) {
    console.warn('Impossible de synchroniser les fichiers à la corbeille :', erreur.message);
  }

  if (idsEnCorbeille.size === 0) return 0;

  const maintenant = new Date();
  const majParId = new Map([...idsEnCorbeille].map((id) => [id, { statut: STATUTS_FICHIER.CORBEILLE, date: maintenant }]));
  const misAJour = appliquerStatutsParId_(majParId, [STATUTS_FICHIER.DORMANT, STATUTS_FICHIER.NOTIFIE]);
  console.info(`Inventaire synchronisé : ${misAJour.size} fichier(s) mis à jour au statut CORBEILLE.`);
  return misAJour.size;
}

/**
 * Recalcule et met à jour les indicateurs Green IT et FinOps dans Tableau_de_Bord.
 * L'empreinte carbone et l'économie cumulent l'inventaire et les actions faites dans la console.
 * @returns {Object} Résumé des indicateurs calculés.
 */
function mettreAJourTableauDeBord() {
  exigerAdministrateur_();
  synchroniserStatutsCorbeilleInventaire_();
  const classeur = obtenirClasseurMaitre_();
  const feuilleTdb = classeur.getSheetByName(NOMS_FEUILLES.TABLEAU_DE_BORD);
  const config = lireConfiguration();

  let nbDormants = 0;
  let nbCorbeille = 0;
  let nbListeBlanche = 0;
  let moDormants = 0;
  let moLiberes = 0;

  lireLignesInventaire_().forEach((ligne) => {
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

  const compteurs = lireCompteursLibreService_();
  const goDormants = Number((moDormants / 1024).toFixed(3));
  const goLiberes = Number((moLiberes / 1024).toFixed(3));
  const goLibreService = Number(((Number(compteurs.moCorbeille) || 0) / 1024).toFixed(3));
  const goTotal = goLiberes + goLibreService;
  const co2EviteKg = Number((goTotal * config.FACTEUR_CO2_KG_PAR_GO_AN).toFixed(3));
  const economieEur = Number((goTotal * config.COUT_GO_ANNUEL_EUR).toFixed(2));

  if (feuilleTdb) {
    const valeursMaj = [
      [nbDormants],
      [nbCorbeille],
      [nbListeBlanche],
      [goDormants],
      [goLiberes],
      [co2EviteKg],
      [economieEur],
      [new Date()]
    ];
    feuilleTdb.getRange(2, 2, valeursMaj.length, 1).setValues(valeursMaj);
    feuilleTdb.getRange(10, 1, 3, 3).setValues([
      ['Console : fichiers mis à la corbeille', Number(compteurs.nbCorbeille) || 0, 'fichiers / files'],
      ['Console : volume mis à la corbeille', goLibreService, 'Go / GB'],
      ['Console : fichiers gardés', Number(compteurs.nbGardes) || 0, 'fichiers / files']
    ]);
  }

  return {
    nbDormants,
    nbCorbeille,
    nbListeBlanche,
    goDormants,
    goLiberes,
    goLibreService,
    nbCorbeilleLibreService: Number(compteurs.nbCorbeille) || 0,
    nbGardesLibreService: Number(compteurs.nbGardes) || 0,
    co2EviteKg,
    economieEur
  };
}
