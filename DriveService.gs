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
 * @param {Object} [diagnostic] Objet accumulateur des motifs de rejet.
 * @returns {Object|null} Informations normalisées du fichier dormant ou null s'il est ignoré.
 */
function evaluerEligibiliteFichier_(fichier, config, dateLimite, idsExclus, contexte, diagnostic) {
  if (!fichier || !fichier.id) {
    return null;
  }
  if (idsExclus.has(fichier.id)) {
    if (diagnostic) diagnostic.dejaInventorieOuProtege = (diagnostic.dejaInventorieOuProtege || 0) + 1;
    return null;
  }
  if (fichier.trashed === true || fichier.explicitlyTrashed === true) {
    if (diagnostic) diagnostic.corbeille = (diagnostic.corbeille || 0) + 1;
    return null;
  }
  if (fichier.mimeType === TYPE_MIME_DOSSIER) {
    if (diagnostic) diagnostic.dossier = (diagnostic.dossier || 0) + 1;
    return null;
  }
  if (Array.isArray(fichier.parents) && fichier.parents.some((idParent) => idsExclus.has(idParent))) {
    if (diagnostic) diagnostic.parentExclu = (diagnostic.parentExclu || 0) + 1;
    return null;
  }

  const dateModif = fichier.modifiedTime ? new Date(fichier.modifiedTime) : null;
  const ignorerConsultation = config && config.IGNORER_CONSULTATION === 'OUI';
  const dateVue = (!ignorerConsultation && fichier.viewedByMeTime) ? new Date(fichier.viewedByMeTime) : null;
  const derniereActivite = (dateVue && dateModif)
    ? (dateVue > dateModif ? dateVue : dateModif)
    : (dateModif || dateVue);

  if (!derniereActivite || derniereActivite > dateLimite) {
    if (diagnostic) {
      if (dateVue && dateVue > dateLimite && dateModif && dateModif <= dateLimite) {
        diagnostic.vueRecente = (diagnostic.vueRecente || 0) + 1;
      } else {
        diagnostic.activiteRecente = (diagnostic.activiteRecente || 0) + 1;
      }
    }
    return null;
  }

  const estNatifGoogle = TYPES_MIME_NATIFS_GOOGLE.includes(fichier.mimeType);
  if (estNatifGoogle && config.INCLURE_FICHIERS_NATIFS !== 'OUI') {
    if (diagnostic) diagnostic.natifNonInclus = (diagnostic.natifNonInclus || 0) + 1;
    return null;
  }

  // quotaBytesUsed = espace décompté (si > 0) ; size en repli si quotaBytesUsed vaut 0 (fichiers exemptés de quota).
  const octetsQuota = Number(fichier.quotaBytesUsed);
  const octetsTaille = Number(fichier.size) || 0;
  const octets = (Number.isFinite(octetsQuota) && octetsQuota > 0) ? octetsQuota : octetsTaille;
  let tailleMo = Number((octets / (1024 * 1024)).toFixed(2));
  if (estNatifGoogle) {
    if (tailleMo === 0) {
      tailleMo = Number(config.POIDS_ESTIME_NATIF_MO) || 0;
    }
  } else if (tailleMo < config.TAILLE_MIN_MO) {
    if (diagnostic) diagnostic.tailleTropPetite = (diagnostic.tailleTropPetite || 0) + 1;
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
 * Détermine le séparateur d'arguments pour les formules Google Sheets (=HYPERLINK)
 * selon la locale du classeur maître (point-virgule en France/Europe, virgule en US/UK).
 * @returns {string} ';' ou ','
 */
function obtenirSeparateurFormule_() {
  try {
    const classeur = obtenirClasseurMaitre_();
    const locale = (classeur && classeur.getSpreadsheetLocale ? classeur.getSpreadsheetLocale() : 'fr').toLowerCase();
    const paysVirgule = ['en_us', 'en_gb', 'en_ca', 'en_au', 'ja_jp', 'zh_cn'];
    return paysVirgule.some((l) => locale.startsWith(l.slice(0, 2))) ? ',' : ';';
  } catch (erreur) {
    return ';';
  }
}

/**
 * Formate une formule de repli vers le dossier parent sans appel d'API (ou pour tests).
 * @param {Object} fichier Objet fichier.
 * @returns {string} Formule =HYPERLINK("...", "...").
 */
function formaterFormuleDossierParentDefaut_(fichier) {
  const sep = obtenirSeparateurFormule_();
  if (!fichier || !Array.isArray(fichier.parents) || fichier.parents.length === 0) {
    return `=HYPERLINK("https://drive.google.com/drive/my-drive"${sep} "Mon Drive")`;
  }
  const idParent = String(fichier.parents[0]).trim();
  if (!idParent || idParent === 'root') {
    return `=HYPERLINK("https://drive.google.com/drive/my-drive"${sep} "Mon Drive")`;
  }
  const nom = (fichier.parentName ? String(fichier.parentName).trim() : 'Dossier').replace(/"/g, () => '""');
  const url = `https://drive.google.com/drive/folders/${idParent}`.replace(/"/g, () => '""');
  return `=HYPERLINK("${url}"${sep} "${nom}")`;
}

/**
 * Construit la formule HYPERLINK pour le dossier parent d'un fichier avec résolution de son nom
 * et mise en cache mémoire pour limiter drastiquement les requêtes Drive API.
 * @param {Object} fichier Fichier retourné par Drive API.
 * @param {Map<string, string>} [cache] Cache idDossier -> formule HYPERLINK.
 * @param {Object} [cacheDossiers] Cache de métadonnées partagé (construireCacheDossiers_).
 * @returns {string} Formule =HYPERLINK("...", "...").
 */
function resoudreFormuleDossierParent_(fichier, cache, cacheDossiers) {
  const sep = obtenirSeparateurFormule_();
  if (!fichier || !Array.isArray(fichier.parents) || fichier.parents.length === 0) {
    return `=HYPERLINK("https://drive.google.com/drive/my-drive"${sep} "Mon Drive")`;
  }
  const idParent = String(fichier.parents[0]).trim();
  if (!idParent || idParent === 'root') {
    return `=HYPERLINK("https://drive.google.com/drive/my-drive"${sep} "Mon Drive")`;
  }
  if (cache && cache.has(idParent)) {
    return cache.get(idParent);
  }

  let nom = 'Dossier';
  let url = `https://drive.google.com/drive/folders/${idParent}`;
  const meta = (cacheDossiers || construireCacheDossiers_()).obtenir(idParent);
  if (meta) {
    if (meta.name) nom = String(meta.name).trim();
    if (meta.webViewLink && /^https:\/\//i.test(meta.webViewLink)) url = String(meta.webViewLink).trim();
  }

  const nomEchappe = nom.replace(/"/g, () => '""');
  const urlEchappee = url.replace(/"/g, () => '""');
  const formule = `=HYPERLINK("${urlEchappee}"${sep} "${nomEchappe}")`;

  if (cache) {
    cache.set(idParent, formule);
  }
  return formule;
}

/**
 * Cache unique des métadonnées de dossiers pour une exécution : un seul appel Drive par dossier
 * (nom, lien, parents), partagé par la liste blanche et la colonne Dossier_Parent.
 * @returns {{obtenir: function(string): ?Object, taille: function(): number}}
 */
function construireCacheDossiers_() {
  const cache = new Map(); // idDossier -> métadonnées ou null si inaccessible
  return {
    obtenir(idDossier) {
      if (!idDossier) return null;
      if (cache.has(idDossier)) return cache.get(idDossier);
      let meta = null;
      try {
        meta = executerAvecRetry_(() => Drive.Files.get(idDossier, {
          fields: 'id, name, webViewLink, parents',
          supportsAllDrives: true
        }));
      } catch (erreur) {
        console.warn(`Métadonnées du dossier ${idDossier} inaccessibles :`, erreur.message);
      }
      cache.set(idDossier, meta);
      return meta;
    },
    taille() {
      return cache.size;
    }
  };
}

/**
 * Construit un vérificateur « ce fichier est-il sous un dossier de la liste blanche ? »
 * qui remonte toute l'arborescence (et pas seulement le parent direct), avec cache.
 * Aucun appel Drive n'est fait si la liste blanche est vide.
 * @param {Set<string>} idsListeBlanche ID protégés (fichiers ou dossiers).
 * @param {Object} [cacheDossiers] Cache de métadonnées partagé (construireCacheDossiers_).
 * @returns {function(Object): boolean} Vérificateur.
 */
function construireVerificateurDossiersProteges_(idsListeBlanche, cacheDossiers) {
  const metadonnees = cacheDossiers || construireCacheDossiers_();
  const protection = new Map(); // idDossier -> boolean (protégé ou non)

  const estDossierProtege = (idDossier, profondeur) => {
    if (idsListeBlanche.has(idDossier)) return true;
    if (protection.has(idDossier)) return protection.get(idDossier);
    if (profondeur >= PROFONDEUR_MAX_ARBORESCENCE) return false;
    protection.set(idDossier, false); // garde-fou contre les cycles
    const meta = metadonnees.obtenir(idDossier);
    const parents = (meta && meta.parents) || [];
    const resultat = parents.some((idParent) => estDossierProtege(idParent, profondeur + 1));
    protection.set(idDossier, resultat);
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
  const cacheDossiers = construireCacheDossiers_();
  const estSousDossierProtege = construireVerificateurDossiersProteges_(idsListeBlanche, cacheDossiers);
  const cacheFormulesParent = new Map();
  // Pas de résolveur ici : le dossier parent n'est résolu (appel Drive) que pour les fichiers retenus.
  const contexte = {
    fuseau: obtenirFuseau_(),
    emailParDefaut: (Session.getEffectiveUser().getEmail() || '').toLowerCase()
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
  let pageAbandonnee = false;
  const diagnostic = {
    scannes: 0,
    dejaInventorieOuProtege: 0,
    corbeille: 0,
    dossier: 0,
    parentExclu: 0,
    sousDossierProtege: 0,
    vueRecente: 0,
    activiteRecente: 0,
    natifNonInclus: 0,
    tailleTropPetite: 0,
    marquesGarder: 0
  };

  do {
    const jetonPageCourante = jetonPage; // permet de rejouer la page si elle doit être abandonnée
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
    const lignesPage = [];
    const idsPage = [];

    for (const fichier of fichiers) {
      // Garde-fou intra-page : au-delà du seuil, la page est abandonnée et sera rejouée à la reprise.
      if ((Date.now() - horodatageDebut) > CONFIGURATION_PAR_DEFAUT.DUREE_LIMITE_PAGE_MS) {
        pageAbandonnee = true;
        break;
      }
      if (estFichierGarde_(fichier)) {
        diagnostic.marquesGarder = (diagnostic.marquesGarder || 0) + 1;
        continue; // gardé par son propriétaire depuis la console
      }
      const candidat = evaluerEligibiliteFichier_(fichier, config, dateLimite, idsExclus, contexte, diagnostic);
      if (!candidat) continue;
      if (estSousDossierProtege(fichier)) {
        diagnostic.sousDossierProtege = (diagnostic.sousDossierProtege || 0) + 1;
        continue;
      }
      candidat.dossierParent = resoudreFormuleDossierParent_(fichier, cacheFormulesParent, cacheDossiers);
      idsExclus.add(candidat.id);
      idsPage.push(candidat.id);
      const nouvelleLigne = [];
      nouvelleLigne[COLONNES_INVENTAIRE.ID] = candidat.id;
      nouvelleLigne[COLONNES_INVENTAIRE.NOM] = protegerTexteCellule_(candidat.nom);
      nouvelleLigne[COLONNES_INVENTAIRE.MIME_TYPE] = candidat.mimeType;
      nouvelleLigne[COLONNES_INVENTAIRE.TAILLE_MO] = candidat.tailleMo;
      nouvelleLigne[COLONNES_INVENTAIRE.DERNIERE_ACTIVITE] = candidat.derniereActiviteDate;
      nouvelleLigne[COLONNES_INVENTAIRE.PROPRIETAIRE] = candidat.proprietaire;
      nouvelleLigne[COLONNES_INVENTAIRE.DOSSIER_PARENT] = candidat.dossierParent;
      nouvelleLigne[COLONNES_INVENTAIRE.URL] = candidat.url;
      nouvelleLigne[COLONNES_INVENTAIRE.STATUT] = STATUTS_FICHIER.DORMANT;
      nouvelleLigne[COLONNES_INVENTAIRE.DATE_TRAITEMENT] = '';
      lignesPage.push(nouvelleLigne);
    }

    if (pageAbandonnee) {
      idsPage.forEach((id) => idsExclus.delete(id));
      jetonPage = jetonPageCourante;
      console.warn(`Page abandonnée par sécurité (temps écoulé) : elle sera rejouée. Dossiers en cache : ${cacheDossiers.taille()}.`);
      break;
    }
    fichiersScannes += fichiers.length;
    diagnostic.scannes = fichiersScannes;
    lignesAInserer.push(...lignesPage);
    jetonPage = reponse.nextPageToken || null;
  } while (jetonPage && (Date.now() - horodatageDebut) < config.DUREE_MAX_EXECUTION_MS);

  // Écriture avant sauvegarde du jeton : si l'écriture échoue, la page sera rejouée (pas de perte).
  enregistrerLotInventaire_(lignesAInserer);

  if (jetonPage || pageAbandonnee) {
    // Page abandonnée dès la première page de la campagne : jeton nul, la reprise repart du début.
    props.setProperties({
      [CLES_PROPRIETES.DATE_LIMITE_AUDIT]: dateLimiteIso,
      [CLES_PROPRIETES.STATUT_CAMPAGNE]: 'EN_COURS'
    });
    if (jetonPage) {
      props.setProperty(CLES_PROPRIETES.JETON_PAGE_DRIVE, jetonPage);
    } else {
      props.deleteProperty(CLES_PROPRIETES.JETON_PAGE_DRIVE);
    }
    planifierRepriseAudit_();
    console.info(`Pause préventive avant timeout. ${lignesAInserer.length} fichiers ajoutés. Reprise planifiée.`);
    return { fichiersScannes, fichiersRetenus: lignesAInserer.length, reprisePlanifiee: true, diagnostic };
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
  return { fichiersScannes, fichiersRetenus: lignesAInserer.length, reprisePlanifiee: false, diagnostic };
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
