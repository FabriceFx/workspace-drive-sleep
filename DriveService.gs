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
  if (fichier.trashed === true || fichier.explicitlyTrashed === true) {
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

  const resoudreParent = (contexte && typeof contexte.resoudreDossierParent === 'function')
    ? contexte.resoudreDossierParent
    : null;
  const dossierParent = resoudreParent
    ? resoudreParent(fichier)
    : formaterFormuleDossierParentDefaut_(fichier);

  return {
    id: fichier.id,
    nom: fichier.name || 'Sans titre',
    mimeType: fichier.mimeType || 'application/octet-stream',
    tailleMo,
    partage: Boolean(fichier.shared),
    derniereActiviteDate: derniereActivite,
    derniereActiviteIso: Utilities.formatDate(derniereActivite, ctx.fuseau, 'dd/MM/yyyy'),
    proprietaire: String(emailProprietaire).toLowerCase(),
    url: fichier.webViewLink || `https://drive.google.com/open?id=${fichier.id}`,
    dossierParent
  };
}

/**
 * Formate une formule de repli vers le dossier parent sans appel d'API (ou pour tests).
 * @param {Object} fichier Objet fichier.
 * @returns {string} Formule =HYPERLINK("...", "...").
 */
function formaterFormuleDossierParentDefaut_(fichier) {
  if (!fichier || !Array.isArray(fichier.parents) || fichier.parents.length === 0) {
    return '=HYPERLINK("https://drive.google.com/drive/my-drive", "Mon Drive")';
  }
  const idParent = String(fichier.parents[0]).trim();
  if (!idParent || idParent === 'root') {
    return '=HYPERLINK("https://drive.google.com/drive/my-drive", "Mon Drive")';
  }
  const nom = (fichier.parentName ? String(fichier.parentName).trim() : 'Dossier').replace(/"/g, () => '""');
  const url = `https://drive.google.com/drive/folders/${idParent}`.replace(/"/g, () => '""');
  return `=HYPERLINK("${url}", "${nom}")`;
}

/**
 * Construit la formule HYPERLINK pour le dossier parent d'un fichier avec résolution de son nom
 * et mise en cache mémoire pour limiter drastiquement les requêtes Drive API.
 * @param {Object} fichier Fichier retourné par Drive API.
 * @param {Map<string, string>} [cache] Cache idDossier -> formule HYPERLINK.
 * @returns {string} Formule =HYPERLINK("...", "...").
 */
function resoudreFormuleDossierParent_(fichier, cache) {
  if (!fichier || !Array.isArray(fichier.parents) || fichier.parents.length === 0) {
    return '=HYPERLINK("https://drive.google.com/drive/my-drive", "Mon Drive")';
  }
  const idParent = String(fichier.parents[0]).trim();
  if (!idParent || idParent === 'root') {
    return '=HYPERLINK("https://drive.google.com/drive/my-drive", "Mon Drive")';
  }
  if (cache && cache.has(idParent)) {
    return cache.get(idParent);
  }

  let nom = 'Dossier';
  let url = `https://drive.google.com/drive/folders/${idParent}`;
  try {
    const meta = executerAvecRetry_(() => Drive.Files.get(idParent, {
      fields: 'name, webViewLink',
      supportsAllDrives: true
    }));
    if (meta) {
      if (meta.name) nom = String(meta.name).trim();
      if (meta.webViewLink) url = String(meta.webViewLink).trim();
    }
  } catch (erreur) {
    console.warn(`Impossible de récupérer les métadonnées du dossier parent ${idParent} :`, erreur.message);
  }

  const nomEchappe = nom.replace(/"/g, () => '""');
  const urlEchappee = url.replace(/"/g, () => '""');
  const formule = `=HYPERLINK("${urlEchappee}", "${nomEchappe}")`;

  if (cache) {
    cache.set(idParent, formule);
  }
  return formule;
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
 * Construit un vérificateur « ce fichier est-il sous un dossier placé à la corbeille ? »
 * qui remonte toute l'arborescence parente avec un cache mémoire.
 * @returns {function(Object): boolean}
 */
function construireVerificateurDossiersCorbeille_() {
  const cacheCorbeille = new Map(); // idDossier -> boolean (dans la corbeille ou non)

  const estDossierCorbeille = (idDossier, profondeur) => {
    if (cacheCorbeille.has(idDossier)) return cacheCorbeille.get(idDossier);
    if (profondeur >= PROFONDEUR_MAX_ARBORESCENCE) return false;
    cacheCorbeille.set(idDossier, false); // garde-fou contre les cycles
    let estCorbeille = false;
    let parents = [];
    try {
      const meta = executerAvecRetry_(() => Drive.Files.get(idDossier, { fields: 'trashed, parents', supportsAllDrives: true }));
      if (meta && meta.trashed === true) {
        estCorbeille = true;
      } else {
        parents = (meta && meta.parents) || [];
      }
    } catch (erreur) {
      console.warn(`Statut du dossier ${idDossier} inaccessible :`, erreur.message);
    }
    const resultat = estCorbeille || parents.some((idParent) => estDossierCorbeille(idParent, profondeur + 1));
    cacheCorbeille.set(idDossier, resultat);
    return resultat;
  };

  return (fichier) => {
    if (!fichier || !Array.isArray(fichier.parents) || fichier.parents.length === 0) return false;
    return fichier.parents.some((idParent) => estDossierCorbeille(idParent, 0));
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
  exigerAdministrateur_();
  if (!acquerirVerrouAudit_()) {
    console.warn('Un audit est déjà en cours : exécution ignorée.');
    return { fichiersScannes: 0, fichiersRetenus: 0, reprisePlanifiee: false, dejaEnCours: true };
  }
  const props = PropertiesService.getScriptProperties();
  try {
    const resultat = executerCycleAudit_();
    props.deleteProperty(CLES_PROPRIETES.ECHECS_REPRISE);
    return resultat;
  } catch (erreur) {
    // Une campagne en cours ne doit pas s'arrêter silencieusement sur une erreur transitoire.
    const campagneEnCours = Boolean(props.getProperty(CLES_PROPRIETES.JETON_PAGE_DRIVE))
      || props.getProperty(CLES_PROPRIETES.STATUT_CAMPAGNE) === 'EN_COURS'
      || props.getProperty(CLES_PROPRIETES.NOTIFIER_EN_FIN_AUDIT) === 'OUI';
    if (campagneEnCours) {
      const nbEchecs = (Number(props.getProperty(CLES_PROPRIETES.ECHECS_REPRISE)) || 0) + 1;
      if (nbEchecs <= CONFIGURATION_PAR_DEFAUT.MAX_ECHECS_REPRISE) {
        props.setProperty(CLES_PROPRIETES.ECHECS_REPRISE, String(nbEchecs));
        planifierRepriseAudit_();
        console.warn(`Audit interrompu (${erreur.message}). Reprise ${nbEchecs}/${CONFIGURATION_PAR_DEFAUT.MAX_ECHECS_REPRISE} planifiée.`);
      } else {
        props.deleteProperty(CLES_PROPRIETES.ECHECS_REPRISE);
        props.setProperty(CLES_PROPRIETES.STATUT_CAMPAGNE, 'ECHEC');
        console.error(`Campagne abandonnée après ${CONFIGURATION_PAR_DEFAUT.MAX_ECHECS_REPRISE} reprises en échec.`);
      }
    }
    throw erreur;
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
  synchroniserStatutsCorbeilleInventaire_();
  const config = lireConfiguration();

  const idsListeBlanche = chargerIdsListeBlanche_();
  const idsExclus = new Set([...idsListeBlanche, ...chargerIdsInventaireExistants_()]);
  const estSousDossierProtege = construireVerificateurDossiersProteges_(idsListeBlanche);
  const estDansDossierCorbeille = construireVerificateurDossiersCorbeille_();
  const cacheDossiersParent = new Map();
  const contexte = {
    fuseau: obtenirFuseau_(),
    emailParDefaut: (Session.getEffectiveUser().getEmail() || '').toLowerCase(),
    resoudreDossierParent: (f) => resoudreFormuleDossierParent_(f, cacheDossiersParent)
  };

  let jetonPage = props.getProperty(CLES_PROPRIETES.JETON_PAGE_DRIVE) || null;
  let dateLimiteIso = props.getProperty(CLES_PROPRIETES.DATE_LIMITE_AUDIT);
  if (!jetonPage || !dateLimiteIso) {
    dateLimiteIso = calculerDateLimite_(config.SEUIL_INACTIVITE_MOIS).toISOString();
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
      fields: 'nextPageToken, files(id, name, mimeType, size, quotaBytesUsed, modifiedTime, viewedByMeTime, owners(emailAddress), webViewLink, parents, shared, properties, appProperties, trashed, explicitlyTrashed)',
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
      if (estFichierGarde_(fichier)) return; // gardé par son propriétaire depuis la console
      const candidat = evaluerEligibiliteFichier_(fichier, config, dateLimite, idsExclus, contexte);
      if (!candidat || estSousDossierProtege(fichier) || estDansDossierCorbeille(fichier)) return;
      idsExclus.add(candidat.id);
      const nouvelleLigne = [];
      nouvelleLigne[COLONNES_INVENTAIRE.ID] = candidat.id;
      nouvelleLigne[COLONNES_INVENTAIRE.NOM] = candidat.nom;
      nouvelleLigne[COLONNES_INVENTAIRE.MIME_TYPE] = candidat.mimeType;
      nouvelleLigne[COLONNES_INVENTAIRE.TAILLE_MO] = candidat.tailleMo;
      nouvelleLigne[COLONNES_INVENTAIRE.DERNIERE_ACTIVITE] = candidat.derniereActiviteDate;
      nouvelleLigne[COLONNES_INVENTAIRE.PROPRIETAIRE] = candidat.proprietaire;
      nouvelleLigne[COLONNES_INVENTAIRE.DOSSIER_PARENT] = candidat.dossierParent;
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
    // Envoi dans une exécution séparée : il dispose de ses propres 6 minutes au lieu du reliquat de l'audit.
    props.deleteProperty(CLES_PROPRIETES.NOTIFIER_EN_FIN_AUDIT);
    planifierEnvoiBilans_();
    console.info('Campagne mensuelle : envoi des bilans planifié dans 1 minute.');
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
