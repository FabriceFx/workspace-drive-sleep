/**
 * @fileoverview Analyse paginée de Google Drive (API v3), filtrage hybride et mise à la corbeille.
 */

const TYPES_MIME_NATIFS_GOOGLE = Object.freeze([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
  'application/vnd.google-apps.form'
]);

/**
 * Détermine si un fichier remplit les critères d'inactivité et de poids.
 * Fonction pure testable unitairement dans Tests.gs.
 * @param {Object} fichier Objet fichier retourné par Drive API v3.
 * @param {Object} config Objet de configuration issu de lireConfiguration().
 * @param {Date} dateLimite Date en deçà de laquelle un fichier est considéré inactif.
 * @param {Set<string>} idsExclus Ensemble des ID déjà en liste blanche ou déjà inventoriés.
 * @returns {Object|null} Informations normalisées du fichier dormant ou null s'il est ignoré.
 */
function evaluerEligibiliteFichier_(fichier, config, dateLimite, idsExclus) {
  if (!fichier || !fichier.id || idsExclus.has(fichier.id)) {
    return null;
  }
  if (fichier.mimeType === 'application/vnd.google-apps.folder') {
    return null;
  }

  if (Array.isArray(fichier.parents) && fichier.parents.some((idParent) => idsExclus.has(idParent))) {
    return null;
  }

  const dateModif = fichier.modifiedTime ? new Date(fichier.modifiedTime) : null;
  const dateVue = fichier.viewedByMeTime ? new Date(fichier.viewedByMeTime) : null;
  const derniereActivite = (dateVue && dateModif)
    ? (dateVue > dateModif ? dateVue : dateModif)
    : (dateModif || dateVue);

  if (!derniereActivite || derniereActivite > dateLimite) {
    return null;
  }

  const estNatifGoogle = TYPES_MIME_NATIFS_GOOGLE.includes(fichier.mimeType);
  if (estNatifGoogle && config.INCLURE_FICHIERS_NATIFS !== 'OUI') {
    return null;
  }

  let tailleMo = 0;
  if (estNatifGoogle) {
    tailleMo = Number(config.POIDS_ESTIME_NATIF_MO) || 2;
  } else {
    const octets = Number(fichier.size) || 0;
    tailleMo = Number((octets / (1024 * 1024)).toFixed(2));
    if (tailleMo < config.TAILLE_MIN_MO) {
      return null;
    }
  }

  const emailProprietaire = (Array.isArray(fichier.owners) && fichier.owners[0]?.emailAddress)
    ? fichier.owners[0].emailAddress
    : (Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '');

  const fuseau = Session.getScriptTimeZone() || 'Europe/Paris';
  const derniereActiviteFr = Utilities.formatDate(derniereActivite, fuseau, 'dd/MM/yyyy');

  return {
    id: fichier.id,
    nom: fichier.name || 'Sans titre',
    mimeType: fichier.mimeType || 'application/octet-stream',
    tailleMo,
    derniereActiviteIso: derniereActiviteFr,
    proprietaire: emailProprietaire,
    url: fichier.webViewLink || `https://drive.google.com/open?id=${fichier.id}`
  };
}

/**
 * Exécute un cycle d'audit paginé sur Google Drive avec gestion automatique du timeout de 6 minutes.
 * @returns {Object} Bilan de l'exécution (fichiersScannes, fichiersRetenus, reprisePlanifiee).
 */
function lancerAuditDrive() {
  const horodatageDebut = Date.now();
  const props = PropertiesService.getScriptProperties();
  const config = lireConfiguration();

  initialiserEnvironnement();

  const idsListeBlanche = chargerIdsListeBlanche_();
  const idsInventaire = chargerIdsInventaireExistants_();
  const idsExclus = new Set([...idsListeBlanche, ...idsInventaire]);

  const dateLimite = new Date();
  dateLimite.setMonth(dateLimite.getMonth() - config.SEUIL_INACTIVITE_MOIS);
  const dateLimiteIso = dateLimite.toISOString();

  let jetonPage = props.getProperty(CLES_PROPRIETES.JETON_PAGE_DRIVE) || null;
  let fichiersScannes = 0;
  const lignesAInserer = [];

  const requeteDrive = `trashed = false and 'me' in owners and modifiedTime < '${dateLimiteIso}'`;

  try {
    do {
      const parametresRequete = {
        q: requeteDrive,
        pageSize: config.TAILLE_PAGE_DRIVE,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, viewedByMeTime, owners(emailAddress), webViewLink, parents)',
        includeItemsFromAllDrives: false,
        supportsAllDrives: true
      };
      if (jetonPage) {
        parametresRequete.pageToken = jetonPage;
      }

      const reponse = executerAvecRetry_(() => Drive.Files.list(parametresRequete));
      const fichiers = reponse.files || [];
      fichiersScannes += fichiers.length;

      fichiers.forEach((fichier) => {
        const candidat = evaluerEligibiliteFichier_(fichier, config, dateLimite, idsExclus);
        if (candidat) {
          idsExclus.add(candidat.id);
          const nouvelleLigne = [];
          nouvelleLigne[COLONNES_INVENTAIRE.ID] = candidat.id;
          nouvelleLigne[COLONNES_INVENTAIRE.NOM] = candidat.nom;
          nouvelleLigne[COLONNES_INVENTAIRE.MIME_TYPE] = candidat.mimeType;
          nouvelleLigne[COLONNES_INVENTAIRE.TAILLE_MO] = candidat.tailleMo;
          nouvelleLigne[COLONNES_INVENTAIRE.DERNIERE_ACTIVITE] = candidat.derniereActiviteIso;
          nouvelleLigne[COLONNES_INVENTAIRE.PROPRIETAIRE] = candidat.proprietaire;
          nouvelleLigne[COLONNES_INVENTAIRE.URL] = candidat.url;
          nouvelleLigne[COLONNES_INVENTAIRE.STATUT] = STATUTS_FICHIER.DORMANT;
          nouvelleLigne[COLONNES_INVENTAIRE.DATE_TRAITEMENT] = '';
          lignesAInserer.push(nouvelleLigne);
        }
      });

      jetonPage = reponse.nextPageToken || null;
    } while (jetonPage && (Date.now() - horodatageDebut) < config.DUREE_MAX_EXECUTION_MS);

    if (lignesAInserer.length > 0) {
      enregistrerLotInventaire_(lignesAInserer);
    }

    if (jetonPage) {
      props.setProperty(CLES_PROPRIETES.JETON_PAGE_DRIVE, jetonPage);
      props.setProperty(CLES_PROPRIETES.STATUT_CAMPAGNE, 'EN_COURS');
      planifierRepriseAudit_();
      console.info(`Pause préventive avant timeout. ${lignesAInserer.length} fichiers ajoutés. Reprise planifiée.`);
      return { fichiersScannes, fichiersRetenus: lignesAInserer.length, reprisePlanifiee: true };
    }

    props.deleteProperty(CLES_PROPRIETES.JETON_PAGE_DRIVE);
    props.setProperty(CLES_PROPRIETES.STATUT_CAMPAGNE, 'TERMINE');
    supprimerDeclencheursReprise_('lancerAuditDrive');
    mettreAJourTableauDeBord();

    console.info(`Audit terminé. Scannés : ${fichiersScannes}, Retenus : ${lignesAInserer.length}`);
    return { fichiersScannes, fichiersRetenus: lignesAInserer.length, reprisePlanifiee: false };
  } catch (erreur) {
    console.error('Erreur lors de l\'audit Drive :', erreur);
    throw erreur;
  }
}

/**
 * Exécute une opération avec retry et backoff exponentiel pour absorber les erreurs transitoires (429, 500, 503).
 * @param {Function} operation Fonction sans argument à exécuter.
 * @param {number} [maxTentatives=3] Nombre maximal de tentatives.
 * @param {number} [delaiInitialMs=1000] Délai initial en millisecondes.
 * @returns {*} Résultat de l'opération.
 */
function executerAvecRetry_(operation, maxTentatives = 3, delaiInitialMs = 1000) {
  let tentative = 0;
  while (tentative < maxTentatives) {
    try {
      return operation();
    } catch (erreur) {
      tentative++;
      const message = String(erreur.message || erreur);
      const estTransitoire = message.includes('429') ||
        message.includes('500') ||
        message.includes('503') ||
        message.includes('User Rate Limit') ||
        message.includes('Rate Limit Exceeded') ||
        message.includes('quota');
      if (!estTransitoire || tentative >= maxTentatives) {
        throw erreur;
      }
      const delai = delaiInitialMs * Math.pow(2, tentative - 1) + Math.random() * 200;
      console.warn(`Tentative ${tentative}/${maxTentatives} échouée (${message}). Nouvelle tentative dans ${Math.round(delai)} ms.`);
      Utilities.sleep(Math.round(delai));
    }
  }
}

/**
 * Place une liste d'identifiants de fichiers à la corbeille ou en liste blanche.
 * @param {Object} payload Objet contenant { action: 'CORBEILLE'|'LISTE_BLANCHE', idsFichiers: string[], motif?: string }
 * @returns {Object} Résultat de l'opération et KPI mis à jour.
 */
function traiterDecisionsUtilisateur(payload) {
  if (!payload || !Array.isArray(payload.idsFichiers) || payload.idsFichiers.length === 0) {
    throw new Error('Aucun fichier sélectionné.');
  }
  const action = payload.action === STATUTS_FICHIER.LISTE_BLANCHE
    ? STATUTS_FICHIER.LISTE_BLANCHE
    : STATUTS_FICHIER.CORBEILLE;
  const ensembleCible = new Set(payload.idsFichiers.map((id) => String(id).trim()));
  const fuseau = Session.getScriptTimeZone() || 'Europe/Paris';
  const maintenantFr = Utilities.formatDate(new Date(), fuseau, 'dd/MM/yyyy');

  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(15000)) {
    throw new Error('Serveur occupé, veuillez réessayer dans quelques secondes.');
  }

  try {
    const classeur = obtenirClasseurMaitre_();
    const feuilleInv = classeur.getSheetByName(NOMS_FEUILLES.INVENTAIRE);
    const feuilleLb = classeur.getSheetByName(NOMS_FEUILLES.LISTE_BLANCHE);
    if (!feuilleInv || feuilleInv.getLastRow() < 2) {
      return { traites: 0, kpi: mettreAJourTableauDeBord() };
    }

    const nbColonnes = Object.keys(COLONNES_INVENTAIRE).length;
    const plage = feuilleInv.getRange(2, 1, feuilleInv.getLastRow() - 1, nbColonnes);
    const lignes = plage.getValues();
    const nouvellesEntreesLb = [];
    let compteurTraites = 0;

    lignes.forEach((ligne) => {
      const idFichier = String(ligne[COLONNES_INVENTAIRE.ID] ?? '').trim();
      const statutActuel = String(ligne[COLONNES_INVENTAIRE.STATUT] ?? '').trim();
      if (!ensembleCible.has(idFichier) || statutActuel === STATUTS_FICHIER.CORBEILLE) {
        return;
      }

      if (action === STATUTS_FICHIER.CORBEILLE) {
        try {
          executerAvecRetry_(() => {
            Drive.Files.update({ trashed: true }, idFichier, null, { supportsAllDrives: true });
          });
          ligne[COLONNES_INVENTAIRE.STATUT] = STATUTS_FICHIER.CORBEILLE;
          ligne[COLONNES_INVENTAIRE.DATE_TRAITEMENT] = maintenantFr;
          compteurTraites++;
        } catch (erreurDrive) {
          console.warn(`Impossible de placer le fichier ${idFichier} à la corbeille :`, erreurDrive.message);
        }
      } else {
        ligne[COLONNES_INVENTAIRE.STATUT] = STATUTS_FICHIER.LISTE_BLANCHE;
        ligne[COLONNES_INVENTAIRE.DATE_TRAITEMENT] = maintenantFr;
        const nouvelleEntree = [];
        nouvelleEntree[COLONNES_LISTE_BLANCHE.ID] = idFichier;
        nouvelleEntree[COLONNES_LISTE_BLANCHE.NOM] = ligne[COLONNES_INVENTAIRE.NOM];
        nouvelleEntree[COLONNES_LISTE_BLANCHE.PROPRIETAIRE] = ligne[COLONNES_INVENTAIRE.PROPRIETAIRE];
        nouvelleEntree[COLONNES_LISTE_BLANCHE.DATE_AJOUT] = maintenantFr;
        nouvelleEntree[COLONNES_LISTE_BLANCHE.MOTIF] = payload.motif || 'Conserver (Validation utilisateur)';
        nouvellesEntreesLb.push(nouvelleEntree);
        compteurTraites++;
      }
    });

    plage.setValues(lignes);

    if (nouvellesEntreesLb.length > 0 && feuilleLb) {
      feuilleLb.getRange(feuilleLb.getLastRow() + 1, 1, nouvellesEntreesLb.length, Object.keys(COLONNES_LISTE_BLANCHE).length).setValues(nouvellesEntreesLb);
    }

    const kpi = mettreAJourTableauDeBord();
    return { traites: compteurTraites, action, kpi };
  } finally {
    verrou.releaseLock();
  }
}
