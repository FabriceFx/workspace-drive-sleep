/**
 * @fileoverview Analyse paginée de Google Drive (API v3), filtrage hybride et mise à la corbeille.
 * Projet : Drive Sleep & Green FinOps (workspace-drive-sleep)
 * Auteur : Fabrice Faucheux (FF Labs - faucheux.bzh)
 */

const TYPES_MIME_NATIFS_GOOGLE = Object.freeze([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
  'application/vnd.google-apps.form'
]);

const TYPE_MIME_DOSSIER = 'application/vnd.google-apps.folder';
const PROFONDEUR_MAX_ARBORESCENCE = 25;

/**
 * Détermine si un fichier remplit les critères d'inactivité et de poids.
 * Fonction sans appel de service quand `contexte` est fourni (testable dans Tests.gs).
 * @param {Object} fichier Objet fichier retourné par Drive API v3.
 * @param {Object} config Objet de configuration issu de lireConfiguration().
 * @param {Date} dateLimite Date en deçà de laquelle un fichier est considéré inactif.
 * @param {Set<string>} idsExclus ID en liste blanche ou déjà inventoriés.
 * @param {Object} [contexte] { fuseau: string, emailParDefaut: string }
 * @returns {Object|null} Informations normalisées du fichier dormant ou null s'il est ignoré.
 */
function evaluerEligibiliteFichier_(fichier, config, dateLimite, idsExclus, contexte) {
  if (!fichier || !fichier.id || idsExclus.has(fichier.id)) {
    return null;
  }
  if (fichier.mimeType === TYPE_MIME_DOSSIER) {
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

  // quotaBytesUsed = espace réellement décompté (révisions comprises, natifs inclus) ; size en repli.
  const aQuota = fichier.quotaBytesUsed !== undefined && fichier.quotaBytesUsed !== null;
  const octets = Number(aQuota ? fichier.quotaBytesUsed : fichier.size) || 0;
  let tailleMo = Number((octets / (1024 * 1024)).toFixed(2));
  if (estNatifGoogle) {
    if (!aQuota) {
      tailleMo = Number(config.POIDS_ESTIME_NATIF_MO) || 0;
    }
  } else if (tailleMo < config.TAILLE_MIN_MO) {
    return null;
  }

  const ctx = contexte || {
    fuseau: obtenirFuseau_(),
    emailParDefaut: Session.getEffectiveUser().getEmail() || ''
  };
  const emailProprietaire = (Array.isArray(fichier.owners) && fichier.owners[0]?.emailAddress)
    ? fichier.owners[0].emailAddress
    : ctx.emailParDefaut;

  return {
    id: fichier.id,
    nom: fichier.name || 'Sans titre',
    mimeType: fichier.mimeType || 'application/octet-stream',
    tailleMo,
    derniereActiviteDate: derniereActivite,
    derniereActiviteIso: Utilities.formatDate(derniereActivite, ctx.fuseau, 'dd/MM/yyyy'),
    proprietaire: String(emailProprietaire).toLowerCase(),
    url: fichier.webViewLink || `https://drive.google.com/open?id=${fichier.id}`
  };
}

/**
 * Construit un vérificateur « ce fichier est-il sous un dossier de la liste blanche ? »
 * qui remonte toute l'arborescence (et pas seulement le parent direct), avec cache.
 * @param {Set<string>} idsListeBlanche ID protégés (fichiers ou dossiers).
 * @returns {function(Object): boolean} Vérificateur.
 */
function construireVerificateurDossiersProteges_(idsListeBlanche) {
  const cacheDossiers = new Map(); // idDossier -> boolean (protégé ou non)

  const estDossierProtege = (idDossier, profondeur) => {
    if (idsListeBlanche.has(idDossier)) return true;
    if (cacheDossiers.has(idDossier)) return cacheDossiers.get(idDossier);
    if (profondeur >= PROFONDEUR_MAX_ARBORESCENCE) return false;
    cacheDossiers.set(idDossier, false); // garde-fou contre les cycles
    let parents = [];
    try {
      const meta = executerAvecRetry_(() => Drive.Files.get(idDossier, { fields: 'parents', supportsAllDrives: true }));
      parents = meta.parents || [];
    } catch (erreur) {
      console.warn(`Parents du dossier ${idDossier} inaccessibles :`, erreur.message);
    }
    const resultat = parents.some((idParent) => estDossierProtege(idParent, profondeur + 1));
    cacheDossiers.set(idDossier, resultat);
    return resultat;
  };

  return (fichier) => {
    if (idsListeBlanche.size === 0 || !Array.isArray(fichier.parents)) return false;
    return fichier.parents.some((idParent) => estDossierProtege(idParent, 0));
  };
}

/**
 * Pose un verrou logique d'audit (propriété horodatée) pour empêcher deux audits simultanés
 * (déclencheur de reprise + lancement manuel) sans bloquer les autres utilisateurs pendant 4 min.
 * @returns {boolean} true si le verrou a été obtenu.
 */
function acquerirVerrouAudit_() {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(10000)) return false;
  try {
    const props = PropertiesService.getScriptProperties();
    const horodatage = Number(props.getProperty(CLES_PROPRIETES.VERROU_AUDIT)) || 0;
    if (horodatage && (Date.now() - horodatage) < CONFIGURATION_PAR_DEFAUT.DUREE_VALIDITE_VERROU_AUDIT_MS) {
      return false;
    }
    props.setProperty(CLES_PROPRIETES.VERROU_AUDIT, String(Date.now()));
    return true;
  } finally {
    verrou.releaseLock();
  }
}

/**
 * Libère le verrou logique d'audit.
 */
function libererVerrouAudit_() {
  PropertiesService.getScriptProperties().deleteProperty(CLES_PROPRIETES.VERROU_AUDIT);
}

/**
 * Exécute un cycle d'audit paginé sur Google Drive avec gestion du timeout de 6 minutes.
 * La date limite est figée au début de la campagne et réutilisée à chaque reprise :
 * le jeton de page Drive n'est valable que pour une requête strictement identique.
 * @returns {Object} Bilan (fichiersScannes, fichiersRetenus, reprisePlanifiee, dejaEnCours).
 */
function lancerAuditDrive() {
  if (!acquerirVerrouAudit_()) {
    console.warn('Un audit est déjà en cours : exécution ignorée.');
    return { fichiersScannes: 0, fichiersRetenus: 0, reprisePlanifiee: false, dejaEnCours: true };
  }
  try {
    return executerCycleAudit_();
  } finally {
    libererVerrouAudit_();
  }
}

/**
 * Corps de l'audit (appelé sous verrou logique).
 * @returns {Object} Bilan de l'exécution.
 */
function executerCycleAudit_() {
  const horodatageDebut = Date.now();
  const props = PropertiesService.getScriptProperties();
  initialiserEnvironnement();
  const config = lireConfiguration();

  const idsListeBlanche = chargerIdsListeBlanche_();
  const idsExclus = new Set([...idsListeBlanche, ...chargerIdsInventaireExistants_()]);
  const estSousDossierProtege = construireVerificateurDossiersProteges_(idsListeBlanche);
  const contexte = {
    fuseau: obtenirFuseau_(),
    emailParDefaut: (Session.getEffectiveUser().getEmail() || '').toLowerCase()
  };

  let jetonPage = props.getProperty(CLES_PROPRIETES.JETON_PAGE_DRIVE) || null;
  let dateLimiteIso = props.getProperty(CLES_PROPRIETES.DATE_LIMITE_AUDIT);
  if (!jetonPage || !dateLimiteIso) {
    const dateLimiteNouvelle = new Date();
    dateLimiteNouvelle.setMonth(dateLimiteNouvelle.getMonth() - config.SEUIL_INACTIVITE_MOIS);
    dateLimiteIso = dateLimiteNouvelle.toISOString();
    jetonPage = null;
  }
  const dateLimite = new Date(dateLimiteIso);
  const requeteDrive = `trashed = false and 'me' in owners and mimeType != '${TYPE_MIME_DOSSIER}' and modifiedTime < '${dateLimiteIso}'`;

  let fichiersScannes = 0;
  const lignesAInserer = [];

  do {
    const parametresRequete = {
      q: requeteDrive,
      pageSize: config.TAILLE_PAGE_DRIVE,
      fields: 'nextPageToken, files(id, name, mimeType, size, quotaBytesUsed, modifiedTime, viewedByMeTime, owners(emailAddress), webViewLink, parents)',
      includeItemsFromAllDrives: false,
      supportsAllDrives: true
    };
    if (jetonPage) {
      parametresRequete.pageToken = jetonPage;
    }

    let reponse;
    try {
      reponse = executerAvecRetry_(() => Drive.Files.list(parametresRequete));
    } catch (erreur) {
      if (jetonPage && /pageToken|invalid/i.test(String(erreur.message))) {
        // Jeton expiré ou invalide : on repart proprement au prochain passage.
        props.deleteProperty(CLES_PROPRIETES.JETON_PAGE_DRIVE);
        props.deleteProperty(CLES_PROPRIETES.DATE_LIMITE_AUDIT);
        console.warn('Jeton de page Drive invalide, campagne réinitialisée :', erreur.message);
      }
      throw erreur;
    }

    const fichiers = reponse.files || [];
    fichiersScannes += fichiers.length;

    fichiers.forEach((fichier) => {
      const candidat = evaluerEligibiliteFichier_(fichier, config, dateLimite, idsExclus, contexte);
      if (!candidat || estSousDossierProtege(fichier)) return;
      idsExclus.add(candidat.id);
      const nouvelleLigne = [];
      nouvelleLigne[COLONNES_INVENTAIRE.ID] = candidat.id;
      nouvelleLigne[COLONNES_INVENTAIRE.NOM] = candidat.nom;
      nouvelleLigne[COLONNES_INVENTAIRE.MIME_TYPE] = candidat.mimeType;
      nouvelleLigne[COLONNES_INVENTAIRE.TAILLE_MO] = candidat.tailleMo;
      nouvelleLigne[COLONNES_INVENTAIRE.DERNIERE_ACTIVITE] = candidat.derniereActiviteDate;
      nouvelleLigne[COLONNES_INVENTAIRE.PROPRIETAIRE] = candidat.proprietaire;
      nouvelleLigne[COLONNES_INVENTAIRE.URL] = candidat.url;
      nouvelleLigne[COLONNES_INVENTAIRE.STATUT] = STATUTS_FICHIER.DORMANT;
      nouvelleLigne[COLONNES_INVENTAIRE.DATE_TRAITEMENT] = '';
      lignesAInserer.push(nouvelleLigne);
    });

    jetonPage = reponse.nextPageToken || null;
  } while (jetonPage && (Date.now() - horodatageDebut) < config.DUREE_MAX_EXECUTION_MS);

  // Écriture avant sauvegarde du jeton : si l'écriture échoue, la page sera rejouée (pas de perte).
  enregistrerLotInventaire_(lignesAInserer);

  if (jetonPage) {
    props.setProperties({
      [CLES_PROPRIETES.JETON_PAGE_DRIVE]: jetonPage,
      [CLES_PROPRIETES.DATE_LIMITE_AUDIT]: dateLimiteIso,
      [CLES_PROPRIETES.STATUT_CAMPAGNE]: 'EN_COURS'
    });
    planifierRepriseAudit_();
    console.info(`Pause préventive avant timeout. ${lignesAInserer.length} fichiers ajoutés. Reprise planifiée.`);
    return { fichiersScannes, fichiersRetenus: lignesAInserer.length, reprisePlanifiee: true };
  }

  props.deleteProperty(CLES_PROPRIETES.JETON_PAGE_DRIVE);
  props.deleteProperty(CLES_PROPRIETES.DATE_LIMITE_AUDIT);
  props.setProperty(CLES_PROPRIETES.STATUT_CAMPAGNE, 'TERMINE');
  supprimerDeclencheursParFonction_(FONCTIONS_DECLENCHEURS.REPRISE_AUDIT);
  mettreAJourTableauDeBord();

  if (props.getProperty(CLES_PROPRIETES.NOTIFIER_EN_FIN_AUDIT) === 'OUI') {
    props.deleteProperty(CLES_PROPRIETES.NOTIFIER_EN_FIN_AUDIT);
    const bilanMail = envoyerNotificationsProprietaires();
    console.info(`Campagne mensuelle : ${bilanMail.emailsEnvoyes} bilan(s) envoyé(s).`);
  }

  console.info(`Audit terminé. Scannés : ${fichiersScannes}, Retenus : ${lignesAInserer.length}`);
  return { fichiersScannes, fichiersRetenus: lignesAInserer.length, reprisePlanifiee: false };
}

/**
 * Exécute une opération avec retry et backoff exponentiel pour absorber les erreurs transitoires.
 * Les erreurs définitives (droits, quota journalier, ID inconnu) sont relancées immédiatement.
 * @param {Function} operation Fonction sans argument à exécuter.
 * @param {number} [maxTentatives=3] Nombre maximal de tentatives.
 * @param {number} [delaiInitialMs=1000] Délai initial en millisecondes.
 * @returns {*} Résultat de l'opération.
 */
function executerAvecRetry_(operation, maxTentatives = 3, delaiInitialMs = 1000) {
  const motifTransitoire = /\b(429|500|502|503|504)\b|rate ?limit|backend error|internal error|timed? ?out/i;
  let tentative = 0;
  while (true) {
    try {
      return operation();
    } catch (erreur) {
      tentative++;
      const message = String(erreur && erreur.message ? erreur.message : erreur);
      if (!motifTransitoire.test(message) || tentative >= maxTentatives) {
        throw erreur;
      }
      const delai = Math.round(delaiInitialMs * Math.pow(2, tentative - 1) + Math.random() * 200);
      console.warn(`Tentative ${tentative}/${maxTentatives} échouée (${message}). Nouvelle tentative dans ${delai} ms.`);
      Utilities.sleep(delai);
    }
  }
}

/**
 * Place une liste de fichiers à la corbeille ou en liste blanche, pour l'utilisateur courant uniquement.
 * Les appels Drive se font hors verrou ; seule la mise à jour de la feuille est verrouillée.
 * @param {Object} payload { action: 'CORBEILLE'|'LISTE_BLANCHE', idsFichiers: string[], motif?: string }
 * @returns {Object} { traites, idsTraites, idsEchecs, action, kpi }
 */
function traiterDecisionsUtilisateur(payload) {
  if (!payload || !Array.isArray(payload.idsFichiers) || payload.idsFichiers.length === 0) {
    throw new Error('Aucun fichier sélectionné.');
  }
  const config = lireConfiguration();
  if (payload.idsFichiers.length > config.TAILLE_LOT_DECISIONS) {
    throw new Error(`Lot trop volumineux (${payload.idsFichiers.length}). Maximum : ${config.TAILLE_LOT_DECISIONS}.`);
  }
  const emailActif = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!emailActif) {
    throw new Error('Identité de l\'utilisateur indisponible : opération refusée.');
  }

  const action = payload.action === STATUTS_FICHIER.LISTE_BLANCHE
    ? STATUTS_FICHIER.LISTE_BLANCHE
    : STATUTS_FICHIER.CORBEILLE;
  const idsDemandes = new Set(payload.idsFichiers.map((id) => String(id).trim()).filter(Boolean));
  const statutsActifs = [STATUTS_FICHIER.DORMANT, STATUTS_FICHIER.NOTIFIE];

  // 1. Contrôle d'autorisation côté serveur : seules les lignes actives de l'utilisateur sont traitables.
  const lignesAutorisees = new Map();
  lireLignesInventaire_().forEach((ligne) => {
    const id = String(ligne[COLONNES_INVENTAIRE.ID] ?? '').trim();
    if (!idsDemandes.has(id)) return;
    const proprietaire = String(ligne[COLONNES_INVENTAIRE.PROPRIETAIRE] ?? '').trim().toLowerCase();
    const statut = String(ligne[COLONNES_INVENTAIRE.STATUT] ?? '').trim();
    if (proprietaire === emailActif && statutsActifs.includes(statut)) {
      lignesAutorisees.set(id, ligne);
    }
  });

  // 2. Appels Drive hors verrou, sous budget de temps.
  const debut = Date.now();
  const idsReussis = [];
  const idsEchecs = [...idsDemandes].filter((id) => !lignesAutorisees.has(id));
  lignesAutorisees.forEach((ligne, id) => {
    if (action !== STATUTS_FICHIER.CORBEILLE) {
      idsReussis.push(id);
      return;
    }
    if ((Date.now() - debut) > config.DUREE_MAX_DECISIONS_MS) {
      idsEchecs.push(id);
      return;
    }
    try {
      executerAvecRetry_(() => Drive.Files.update({ trashed: true }, id, null, { supportsAllDrives: true }));
      idsReussis.push(id);
    } catch (erreurDrive) {
      console.warn(`Impossible de placer le fichier ${id} à la corbeille :`, erreurDrive.message);
      idsEchecs.push(id);
    }
  });

  // 3. Mise à jour de la feuille sous verrou court.
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(30000)) {
    throw new Error('Serveur occupé, veuillez réessayer dans quelques secondes. Les fichiers déjà mis à la corbeille le restent.');
  }
  try {
    const maintenant = new Date();
    const majParId = new Map(idsReussis.map((id) => [id, { statut: action, date: maintenant }]));
    const idsMisAJour = appliquerStatutsParId_(majParId, statutsActifs);

    if (action === STATUTS_FICHIER.LISTE_BLANCHE) {
      const idsDejaProteges = chargerIdsListeBlanche_();
      const nouvellesEntrees = [...idsMisAJour]
        .filter((id) => !idsDejaProteges.has(id))
        .map((id) => {
          const ligne = lignesAutorisees.get(id);
          const entree = [];
          entree[COLONNES_LISTE_BLANCHE.ID] = id;
          entree[COLONNES_LISTE_BLANCHE.NOM] = ligne[COLONNES_INVENTAIRE.NOM];
          entree[COLONNES_LISTE_BLANCHE.PROPRIETAIRE] = ligne[COLONNES_INVENTAIRE.PROPRIETAIRE];
          entree[COLONNES_LISTE_BLANCHE.DATE_AJOUT] = maintenant;
          entree[COLONNES_LISTE_BLANCHE.MOTIF] = String(payload.motif || 'Conserver (Validation utilisateur)').slice(0, 200);
          return entree;
        });
      const feuilleLb = obtenirClasseurMaitre_().getSheetByName(NOMS_FEUILLES.LISTE_BLANCHE);
      if (nouvellesEntrees.length > 0 && feuilleLb) {
        feuilleLb.getRange(feuilleLb.getLastRow() + 1, 1, nouvellesEntrees.length, Object.keys(COLONNES_LISTE_BLANCHE).length)
          .setValues(nouvellesEntrees);
      }
    }

    const kpi = mettreAJourTableauDeBord();
    return {
      traites: idsMisAJour.size,
      idsTraites: [...idsMisAJour],
      idsEchecs,
      action,
      kpi
    };
  } finally {
    verrou.releaseLock();
  }
}
