/**
 * @fileoverview Console de tri (menu Sheets) : l'utilisateur qui l'ouvre analyse son propre Drive
 * en direct, garde ou met à la corbeille ses fichiers, et peut annuler.
 * Les compteurs anonymes de la console sont conservés dans les propriétés du script.
 * Projet : Drive Sleep & Green FinOps (workspace-drive-sleep)
 * Auteur : Fabrice Faucheux (FF Labs - faucheux.bzh)
 */

const CLE_APP_PROPERTY_CONSERVER = 'driveSleepConserver';
const FORMAT_DATE_ISO_STRICT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

/* ===================== Compteurs anonymes ===================== */

/**
 * Lit les compteurs anonymes de la console.
 * @returns {{nbCorbeille: number, moCorbeille: number, nbGardes: number, nbRestaures: number}}
 */
function lireCompteursLibreService_() {
  const vide = { nbCorbeille: 0, moCorbeille: 0, nbGardes: 0, nbRestaures: 0 };
  try {
    const brut = PropertiesService.getScriptProperties().getProperty(CLES_PROPRIETES.KPI_LIBRE_SERVICE);
    return brut ? { ...vide, ...JSON.parse(brut) } : vide;
  } catch (erreur) {
    return vide;
  }
}

/**
 * Ajoute des deltas aux compteurs anonymes. L'appelant doit détenir le verrou de script.
 * @param {Object} deltas Ex. { nbCorbeille: 3, moCorbeille: 120.5 }
 */
function incrementerCompteursLibreService_(deltas) {
  const compteurs = lireCompteursLibreService_();
  Object.keys(deltas).forEach((cle) => {
    compteurs[cle] = Math.max(0, Number(((Number(compteurs[cle]) || 0) + (Number(deltas[cle]) || 0)).toFixed(2)));
  });
  PropertiesService.getScriptProperties().setProperty(CLES_PROPRIETES.KPI_LIBRE_SERVICE, JSON.stringify(compteurs));
}

/* ===================== Fonctions appelées par Ui.html (google.script.run) ===================== */

/**
 * Charge les fichiers dormants de l'utilisateur courant depuis l'onglet Inventaire_Dormant.
 * Si la feuille contient des éléments pour cet utilisateur, ils sont renvoyés triés par taille décroissante.
 * @returns {{fichiers: Object[], totalInventaire: number, totalDormantsSheet: number, source: string}}
 */
function chargerMesFichiersInventaire() {
  try {
    synchroniserStatutsCorbeilleInventaire_();
  } catch (erreur) {
    console.warn('Synchronisation préalable de la corbeille ignorée :', erreur.message);
  }

  const emailActif = ((Session.getActiveUser && Session.getActiveUser().getEmail()) || '').trim().toLowerCase();
  const emailEffectif = ((Session.getEffectiveUser && Session.getEffectiveUser().getEmail()) || '').trim().toLowerCase();
  const emailCourant = emailActif || emailEffectif;

  const lignes = lireLignesInventaire_();
  const fichiers = [];
  let totalDormantsSheet = 0;

  // Déterminer s'il n'y a qu'un seul propriétaire dans toute la feuille
  const proprietairesUniques = new Set();
  lignes.forEach((ligne) => {
    const statut = String(ligne[COLONNES_INVENTAIRE.STATUT] ?? '').trim().toUpperCase();
    if (statut === STATUTS_FICHIER.DORMANT || statut === STATUTS_FICHIER.NOTIFIE) {
      totalDormantsSheet++;
      const p = String(ligne[COLONNES_INVENTAIRE.PROPRIETAIRE] ?? '').trim().toLowerCase();
      if (p) proprietairesUniques.add(p);
    }
  });

  const monoUtilisateur = proprietairesUniques.size <= 1;

  lignes.forEach((ligne) => {
    const statut = String(ligne[COLONNES_INVENTAIRE.STATUT] ?? '').trim().toUpperCase();
    if (statut !== STATUTS_FICHIER.DORMANT && statut !== STATUTS_FICHIER.NOTIFIE) return;

    const id = String(ligne[COLONNES_INVENTAIRE.ID] ?? '').trim();
    if (!id) return;

    const proprietaireLigne = String(ligne[COLONNES_INVENTAIRE.PROPRIETAIRE] ?? '').trim().toLowerCase();

    // En environnement mono-utilisateur ou si l'email n'est pas résolu, on accepte tout.
    // En multi-utilisateurs avec email résolu, on filtre strictement sur l'utilisateur courant.
    const estAUtilisateur = monoUtilisateur || !emailCourant || !proprietaireLigne || proprietaireLigne === emailCourant;
    if (!estAUtilisateur) return;

    const nom = String(ligne[COLONNES_INVENTAIRE.NOM] ?? '').trim();
    const mimeType = String(ligne[COLONNES_INVENTAIRE.MIME_TYPE] ?? '').trim();
    const tailleMo = Number(ligne[COLONNES_INVENTAIRE.TAILLE_MO]) || 0;
    const url = /^https:\/\//i.test(String(ligne[COLONNES_INVENTAIRE.URL] ?? '')) ? String(ligne[COLONNES_INVENTAIRE.URL]).trim() : '';
    const dateActivite = formaterDateFr_(ligne[COLONNES_INVENTAIRE.DERNIERE_ACTIVITE]);
    const dossierBrut = ligne[COLONNES_INVENTAIRE.DOSSIER_PARENT];
    const dossierParent = extraireNomDossierParent_(dossierBrut);

    fichiers.push({
      id: id,
      nom: nom,
      mimeType: mimeType,
      tailleMo: tailleMo,
      partage: false,
      derniereActivite: dateActivite,
      url: url,
      dossierParent: dossierParent,
      source: 'INVENTAIRE'
    });
  });

  fichiers.sort((a, b) => (Number(b.tailleMo) || 0) - (Number(a.tailleMo) || 0));

  return {
    fichiers: fichiers,
    totalInventaire: fichiers.length,
    totalDormantsSheet: totalDormantsSheet,
    source: 'INVENTAIRE'
  };
}

/**
 * Analyse un lot du Drive de l'utilisateur (appel court, répété par la console tant qu'il reste des pages).
 * @param {Object} [parametres] { jetonPage?: string, dateLimiteIso?: string } renvoyés par l'appel précédent.
 * @returns {{fichiers: Object[], jetonSuivant: (string|null), dateLimiteIso: string, scannes: number}}
 */
function analyserMonDrive(parametres) {
  const debut = Date.now();
  const config = lireConfiguration();
  const idsProteges = chargerIdsListeBlanche_();
  const estSousDossierProtege = construireVerificateurDossiersProteges_(idsProteges, construireCacheDossiers_());
  const contexte = {
    fuseau: obtenirFuseau_(),
    emailParDefaut: (Session.getEffectiveUser().getEmail() || '').toLowerCase()
  };

  // La date limite revient de la console : validation stricte avant de l'injecter dans la requête Drive.
  let dateLimiteIso = parametres && parametres.dateLimiteIso;
  let jetonPage = (parametres && typeof parametres.jetonPage === 'string' && parametres.jetonPage) || null;
  if (!jetonPage || typeof dateLimiteIso !== 'string' || !FORMAT_DATE_ISO_STRICT.test(dateLimiteIso)) {
    dateLimiteIso = calculerDateLimite_(config.SEUIL_INACTIVITE_MOIS).toISOString();
    jetonPage = null;
  }
  const dateLimite = new Date(dateLimiteIso);
  const requete = `trashed = false and 'me' in owners and mimeType != '${TYPE_MIME_DOSSIER}' and modifiedTime < '${dateLimiteIso}'`;

  const fichiers = [];
  let scannes = 0;
  do {
    const options = {
      q: requete,
      pageSize: config.TAILLE_PAGE_DRIVE,
      fields: 'nextPageToken, files(id, name, mimeType, size, quotaBytesUsed, modifiedTime, viewedByMeTime, owners(emailAddress), webViewLink, parents, shared, properties, appProperties, trashed, explicitlyTrashed)',
      includeItemsFromAllDrives: false,
      supportsAllDrives: true
    };
    if (jetonPage) options.pageToken = jetonPage;

    const reponse = executerAvecRetry_(() => Drive.Files.list(options));
    (reponse.files || []).forEach((fichier) => {
      scannes++;
      if (estFichierGarde_(fichier)) return;
      const candidat = evaluerEligibiliteFichier_(fichier, config, dateLimite, idsProteges, contexte);
      if (!candidat || estSousDossierProtege(fichier)) return;
      fichiers.push({
        id: candidat.id,
        nom: candidat.nom,
        mimeType: candidat.mimeType,
        tailleMo: candidat.tailleMo,
        partage: candidat.partage,
        derniereActivite: candidat.derniereActiviteIso,
        url: /^https:\/\//i.test(candidat.url) ? candidat.url : ''
      });
    });
    jetonPage = reponse.nextPageToken || null;
  } while (jetonPage && (Date.now() - debut) < config.DUREE_MAX_ANALYSE_APPEL_MS);

  return { fichiers, jetonSuivant: jetonPage, dateLimiteIso, scannes };
}

/**
 * Met à la corbeille des fichiers dont l'utilisateur est propriétaire.
 * @param {string[]} ids ID des fichiers (lot de TAILLE_LOT_DECISIONS au plus).
 * @returns {{idsTraites: string[], idsEchecs: string[], moLiberes: number}}
 */
function mettreCorbeilleMesFichiers(ids) {
  const resultat = appliquerSurMesFichiers_(ids, { trashed: false, accepterDejaFait: true }, (id) => {
    Drive.Files.update({ trashed: true }, id, null, { supportsAllDrives: true });
  });
  enregistrerEffetsLibreService_(resultat, STATUTS_FICHIER.CORBEILLE, [STATUTS_FICHIER.DORMANT, STATUTS_FICHIER.NOTIFIE], {
    nbCorbeille: 1,
    moCorbeille: 'taille'
  });
  // Pour l'interface, un fichier déjà à la corbeille est « traité » (il sort de la liste) ;
  // il n'entre pas dans le volume libéré ni dans les compteurs.
  return { idsTraites: [...resultat.idsTraites, ...resultat.idsDejaFaits], idsEchecs: resultat.idsEchecs, moLiberes: resultat.moTotal };
}

/**
 * Restaure (sort de la corbeille) des fichiers dont l'utilisateur est propriétaire — bouton « Annuler ».
 * @param {string[]} ids ID des fichiers.
 * @returns {{idsTraites: string[], idsEchecs: string[], moLiberes: number}}
 */
function annulerCorbeilleMesFichiers(ids) {
  const resultat = appliquerSurMesFichiers_(ids, { trashed: true, accepterDejaFait: true }, (id) => {
    Drive.Files.update({ trashed: false }, id, null, { supportsAllDrives: true });
  });
  enregistrerEffetsLibreService_(resultat, STATUTS_FICHIER.DORMANT, [STATUTS_FICHIER.CORBEILLE], {
    nbCorbeille: -1,
    moCorbeille: '-taille',
    nbRestaures: 1
  }, '');
  return { idsTraites: [...resultat.idsTraites, ...resultat.idsDejaFaits], idsEchecs: resultat.idsEchecs, moLiberes: -resultat.moTotal };
}

/**
 * Marque des fichiers de l'utilisateur comme « à garder » : ils ne lui seront plus jamais proposés.
 * Le marqueur est une propriété Drive publique (`properties`) posée sur le fichier : contrairement
 * aux appProperties, elle ne dépend pas du projet Google Cloud du script et survit à un changement de projet.
 * @param {string[]} ids ID des fichiers.
 * @returns {{idsTraites: string[], idsEchecs: string[]}}
 */
function conserverMesFichiers(ids) {
  // Un fichier à la corbeille ne peut pas être « gardé » : il est renvoyé en échec.
  const resultat = appliquerSurMesFichiers_(ids, { trashed: false, accepterDejaFait: false }, (id) => {
    Drive.Files.update({ properties: { [CLE_APP_PROPERTY_CONSERVER]: '1' } }, id, null, { supportsAllDrives: true });
  });
  enregistrerEffetsLibreService_(resultat, STATUTS_FICHIER.LISTE_BLANCHE, [STATUTS_FICHIER.DORMANT, STATUTS_FICHIER.NOTIFIE], {
    nbGardes: 1
  });
  return { idsTraites: resultat.idsTraites, idsEchecs: resultat.idsEchecs };
}

/* ===================== Utilitaires internes ===================== */

/**
 * Indique si un fichier porte le marqueur « à garder » (propriété publique, ou appProperty
 * pour compatibilité avec d'éventuels marquages antérieurs).
 * @param {Object} fichier Fichier Drive v3 (avec properties / appProperties).
 * @returns {boolean}
 */
function estFichierGarde_(fichier) {
  if (!fichier) return false;
  const publique = fichier.properties && fichier.properties[CLE_APP_PROPERTY_CONSERVER] === '1';
  const privee = fichier.appProperties && fichier.appProperties[CLE_APP_PROPERTY_CONSERVER] === '1';
  return Boolean(publique || privee);
}

/**
 * Applique une opération Drive aux seuls fichiers dont l'utilisateur est propriétaire,
 * sous budget de temps. La propriété est revérifiée auprès de Drive (jamais sur la foi de la page).
 * Un fichier déjà dans l'état cible n'est pas retouché : il est classé « déjà fait » si
 * `accepterDejaFait` est vrai (opération idempotente), sinon en échec.
 * @param {string[]} ids ID demandés.
 * @param {{trashed: boolean, accepterDejaFait: boolean}} regles État de corbeille attendu avant l'opération.
 * @param {function(string): void} operation Opération Drive à appliquer.
 * @returns {{idsTraites: string[], idsDejaFaits: string[], idsEchecs: string[], taillesMo: Map<string, number>, moTotal: number}}
 */
function appliquerSurMesFichiers_(ids, regles, operation) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('Aucun fichier sélectionné.');
  }
  const config = lireConfiguration();
  if (ids.length > config.TAILLE_LOT_DECISIONS) {
    throw new Error(`Lot trop volumineux (${ids.length}). Maximum : ${config.TAILLE_LOT_DECISIONS}.`);
  }
  const debut = Date.now();
  const idsTraites = [];
  const idsDejaFaits = [];
  const idsEchecs = [];
  const taillesMo = new Map(); // uniquement les fichiers réellement traités par cet appel

  [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))].forEach((id) => {
    if ((Date.now() - debut) > config.DUREE_MAX_DECISIONS_MS) {
      idsEchecs.push(id);
      return;
    }
    try {
      const meta = executerAvecRetry_(() => Drive.Files.get(id, {
        fields: 'id, ownedByMe, trashed, size, quotaBytesUsed',
        supportsAllDrives: true
      }));
      if (!meta.ownedByMe) {
        idsEchecs.push(id);
        return;
      }
      const dejaDansEtatCible = Boolean(meta.trashed) !== regles.trashed;
      if (dejaDansEtatCible) {
        (regles.accepterDejaFait ? idsDejaFaits : idsEchecs).push(id);
        return;
      }
      executerAvecRetry_(() => operation(id));
      const octets = Number(meta.quotaBytesUsed !== undefined ? meta.quotaBytesUsed : meta.size) || 0;
      taillesMo.set(id, octets / (1024 * 1024));
      idsTraites.push(id);
    } catch (erreur) {
      console.warn(`Opération impossible sur ${id} :`, erreur.message);
      idsEchecs.push(id);
    }
  });

  const moTotal = Number([...taillesMo.values()].reduce((a, b) => a + b, 0).toFixed(2));
  return { idsTraites, idsDejaFaits, idsEchecs, taillesMo, moTotal };
}

/**
 * Met à jour les compteurs anonymes et, si l'utilisateur est administrateur, synchronise l'inventaire.
 * Les fichiers synchronisés dans l'inventaire ne sont pas comptés une seconde fois dans les compteurs.
 * @param {Object} resultat Résultat de appliquerSurMesFichiers_.
 * @param {string} nouveauStatut Statut d'inventaire à appliquer.
 * @param {string[]} statutsModifiables Statuts d'inventaire remplaçables.
 * @param {Object} deltasParFichier Deltas par fichier ('taille' / '-taille' = taille du fichier en Mo).
 * @param {Date|string} [dateTraitement=new Date()] Date de traitement à enregistrer (ou vide).
 */
function enregistrerEffetsLibreService_(resultat, nouveauStatut, statutsModifiables, deltasParFichier, dateTraitement = new Date()) {
  const idsASynchroniser = [...resultat.idsTraites, ...(resultat.idsDejaFaits || [])];
  if (idsASynchroniser.length === 0) return;
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(20000)) {
    console.warn('Compteurs de la console non mis à jour (verrou indisponible).');
    return;
  }
  try {
    let idsInventaire = new Set();
    try {
      const majParId = new Map(idsASynchroniser.map((id) => [id, { statut: nouveauStatut, date: dateTraitement }]));
      idsInventaire = appliquerStatutsParId_(majParId, statutsModifiables);
      if (idsInventaire.size > 0) mettreAJourTableauDeBord();
    } catch (erreur) {
      console.warn('Synchronisation de l\'inventaire impossible :', erreur.message);
    }

    const totaux = {};
    resultat.idsTraites.filter((id) => !idsInventaire.has(id)).forEach((id) => {
      Object.keys(deltasParFichier).forEach((cle) => {
        const regle = deltasParFichier[cle];
        let valeur = regle;
        if (regle === 'taille') valeur = resultat.taillesMo.get(id) || 0;
        if (regle === '-taille') valeur = -(resultat.taillesMo.get(id) || 0);
        totaux[cle] = (totaux[cle] || 0) + valeur;
      });
    });
    if (Object.keys(totaux).length > 0) {
      incrementerCompteursLibreService_(totaux);
    }
  } finally {
    verrou.releaseLock();
  }
}

/**
 * Extrait le nom affichable du dossier parent, que la cellule contienne du texte ou une formule HYPERLINK.
 * @param {*} valeur Valeur brute issue de la feuille.
 * @returns {string} Nom du dossier parent ou vide.
 */
function extraireNomDossierParent_(valeur) {
  if (!valeur) return '';
  const chaine = String(valeur).trim();
  if (!chaine.startsWith('=')) return chaine;
  const correspondance = chaine.match(/[,;]\s*"((?:[^"]|"")*)"\s*\)$/);
  if (correspondance) {
    return correspondance[1].replace(/""/g, '"');
  }
  return '';
}

