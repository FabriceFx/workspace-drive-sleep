/**
 * @fileoverview Suite de tests unitaires et d'intégration pour Drive Sleep & Green FinOps.
 * Exécuter `runAllTests()` depuis l'éditeur Apps Script ou le menu personnalisé.
 * Projet : Drive Sleep & Green FinOps (workspace-drive-sleep)
 * Auteur : Fabrice Faucheux (FF Labs - faucheux.bzh)
 */

/**
 * Exécute l'ensemble des tests et affiche le bilan.
 * @returns {{reussis: number, echoues: number, details: string[]}}
 */
function runAllTests() {
  exigerAdministrateur_();
  const tests = [
    test_CA01_initialisationFeuilles,
    test_CA02_filtrageFichierBinaireDormant,
    test_CA02_exclusionListeBlancheEtFichiersRecents,
    test_CA02_tailleReelleQuotaBytesUsed,
    test_CA02_quotaZeroUtiliseTailleFichier,
    test_CA02_natifSansQuotaUtilisePoidsEstime,
    test_CA02_ignorerConsultation,
    test_CA03_echappementHtmlSecurite,
    test_CA03_formatageDateMailFr,
    test_CA04_calculKpiTableauDeBord,
    test_CA05_constantesColonnes,
    test_CA05_declencheursDistincts,
    test_CA06_retryBackoff,
    test_CA06_retryErreurDefinitive,
    test_CA07_marqueurGarder,
    test_CA07_dateLimiteClientValidee,
    test_CA08_dateLimiteFinDeMois,
    test_CA08_fichierPartageSignale,
    test_CA09_fichierCorbeilleExclu,
    test_CA10_formuleDossierParent,
    test_CA11_protectionNomCommeFormule,
    test_CA11_schemaInventaireControle,
    test_CA12_chargementInventaireConsole
  ];

  let reussis = 0;
  let echoues = 0;
  const details = [];

  tests.forEach((fnTest) => {
    try {
      fnTest();
      reussis++;
      details.push(`✅ ${fnTest.name} : OK`);
      console.info(`✅ ${fnTest.name} : OK`);
    } catch (erreur) {
      echoues++;
      details.push(`❌ ${fnTest.name} : ${erreur.message}`);
      console.error(`❌ ${fnTest.name} :`, erreur.message);
    }
  });

  const bilan = `Tests terminés : ${reussis} réussi(s), ${echoues} échoué(s).`;
  console.info(bilan);
  if (SpreadsheetApp.getActiveSpreadsheet()) {
    SpreadsheetApp.getActiveSpreadsheet().toast(bilan, '🧪 Tests unitaires', 8);
  }
  return { reussis, echoues, details };
}

/**
 * Lève une erreur si la condition est fausse.
 * @param {boolean} condition
 * @param {string} message
 */
function affirmer_(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const CONTEXTE_TEST_ = Object.freeze({ fuseau: 'Europe/Paris', emailParDefaut: 'defaut@exemple.fr' });

function test_CA01_initialisationFeuilles() {
  initialiserEnvironnement();
  const classeur = obtenirClasseurMaitre_();
  Object.values(NOMS_FEUILLES).forEach((nom) => {
    affirmer_(Boolean(classeur.getSheetByName(nom)), `La feuille ${nom} devrait exister après initialisation.`);
  });
}

function test_CA02_filtrageFichierBinaireDormant() {
  const config = { ...CONFIGURATION_PAR_DEFAUT, SEUIL_INACTIVITE_MOIS: 12, TAILLE_MIN_MO: 5 };
  const dateLimite = new Date('2025-10-01T00:00:00Z');
  const fauxFichier = {
    id: 'file_123',
    name: 'Archive_2023.zip',
    mimeType: 'application/zip',
    size: String(20 * 1024 * 1024),
    modifiedTime: '2024-01-15T10:00:00Z',
    viewedByMeTime: '2024-02-01T10:00:00Z',
    owners: [{ emailAddress: 'Test@Exemple.fr' }]
  };
  const resultat = evaluerEligibiliteFichier_(fauxFichier, config, dateLimite, new Set(), CONTEXTE_TEST_);
  affirmer_(resultat !== null, 'Le fichier binaire dormant de 20 Mo aurait dû être retenu.');
  affirmer_(resultat.tailleMo === 20, `Taille attendue 20 Mo, obtenue : ${resultat.tailleMo}`);
  affirmer_(resultat.derniereActiviteIso === '01/02/2024', `Date attendue 01/02/2024, obtenue : ${resultat.derniereActiviteIso}`);
  affirmer_(resultat.derniereActiviteDate instanceof Date, 'La date d\'activité doit être un objet Date pour la feuille.');
  affirmer_(resultat.proprietaire === 'test@exemple.fr', 'L\'adresse du propriétaire doit être normalisée en minuscules.');
}

function test_CA02_exclusionListeBlancheEtFichiersRecents() {
  const config = { ...CONFIGURATION_PAR_DEFAUT, SEUIL_INACTIVITE_MOIS: 12, TAILLE_MIN_MO: 5 };
  const dateLimite = new Date('2025-10-01T00:00:00Z');
  const idsExclus = new Set(['id_protege']);

  const fichierProtege = { id: 'id_protege', name: 'Statuts.pdf', mimeType: 'application/pdf', size: String(50 * 1024 * 1024), modifiedTime: '2022-01-01T00:00:00Z' };
  affirmer_(evaluerEligibiliteFichier_(fichierProtege, config, dateLimite, idsExclus, CONTEXTE_TEST_) === null, 'Le fichier en liste blanche doit être ignoré.');

  const fichierTropPetit = { id: 'id_petit', name: 'note.txt', mimeType: 'text/plain', size: String(100 * 1024), modifiedTime: '2022-01-01T00:00:00Z' };
  affirmer_(evaluerEligibiliteFichier_(fichierTropPetit, config, dateLimite, idsExclus, CONTEXTE_TEST_) === null, 'Le fichier binaire inférieur à 5 Mo doit être ignoré.');

  const fichierRecent = { id: 'id_recent', name: 'video.mp4', mimeType: 'video/mp4', size: String(500 * 1024 * 1024), modifiedTime: '2022-01-01T00:00:00Z', viewedByMeTime: '2026-01-01T00:00:00Z' };
  affirmer_(evaluerEligibiliteFichier_(fichierRecent, config, dateLimite, idsExclus, CONTEXTE_TEST_) === null, 'Un fichier consulté récemment doit être ignoré.');
}

function test_CA02_tailleReelleQuotaBytesUsed() {
  const config = { ...CONFIGURATION_PAR_DEFAUT };
  const dateLimite = new Date('2025-10-01T00:00:00Z');
  const fichier = { id: 'id_rev', name: 'plan.pdf', mimeType: 'application/pdf', size: String(4 * 1024 * 1024), quotaBytesUsed: String(12 * 1024 * 1024), modifiedTime: '2022-01-01T00:00:00Z' };
  const resultat = evaluerEligibiliteFichier_(fichier, config, dateLimite, new Set(), CONTEXTE_TEST_);
  affirmer_(resultat !== null && resultat.tailleMo === 12, 'quotaBytesUsed (révisions comprises) doit primer sur size.');
}

function test_CA02_natifSansQuotaUtilisePoidsEstime() {
  const config = { ...CONFIGURATION_PAR_DEFAUT, POIDS_ESTIME_NATIF_MO: 2 };
  const dateLimite = new Date('2025-10-01T00:00:00Z');
  const natif = { id: 'id_doc', name: 'Compte rendu', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2022-01-01T00:00:00Z' };
  const resultat = evaluerEligibiliteFichier_(natif, config, dateLimite, new Set(), CONTEXTE_TEST_);
  affirmer_(resultat !== null && resultat.tailleMo === 2, 'Un natif sans quotaBytesUsed doit utiliser le poids estimé.');
  affirmer_(resultat.proprietaire === 'defaut@exemple.fr', 'Sans propriétaire renvoyé, l\'adresse par défaut du contexte doit être utilisée.');
}

function test_CA02_quotaZeroUtiliseTailleFichier() {
  const config = { ...CONFIGURATION_PAR_DEFAUT, TAILLE_MIN_MO: 1 };
  const dateLimite = new Date('2025-10-01T00:00:00Z');
  const fichier = { id: 'id_photo', name: 'photo.jpg', mimeType: 'image/jpeg', size: String(4 * 1024 * 1024), quotaBytesUsed: '0', modifiedTime: '2022-01-01T00:00:00Z' };
  const resultat = evaluerEligibiliteFichier_(fichier, config, dateLimite, new Set(), CONTEXTE_TEST_);
  affirmer_(resultat !== null && resultat.tailleMo === 4, 'Un fichier avec quotaBytesUsed à 0 doit utiliser sa taille réelle (size).');
}

function test_CA02_ignorerConsultation() {
  const config = { ...CONFIGURATION_PAR_DEFAUT, IGNORER_CONSULTATION: 'OUI' };
  const dateLimite = new Date('2025-10-01T00:00:00Z');
  const fichierConsulte = { id: 'id_vu', name: 'guide.pdf', mimeType: 'application/pdf', size: String(10 * 1024 * 1024), modifiedTime: '2022-01-01T00:00:00Z', viewedByMeTime: '2026-10-01T00:00:00Z' };
  const resultat = evaluerEligibiliteFichier_(fichierConsulte, config, dateLimite, new Set(), CONTEXTE_TEST_);
  affirmer_(resultat !== null, 'Avec IGNORER_CONSULTATION=OUI, la date de consultation récente ne doit pas éliminer le fichier si la date de modification est ancienne.');
}

function test_CA03_echappementHtmlSecurite() {
  const echappe = echapperHtml_('<script>alert("xss")</script>');
  affirmer_(!echappe.includes('<script>'), 'Les balises HTML doivent être échappées.');
}

function test_CA03_formatageDateMailFr() {
  const objetDate = new Date(2024, 0, 15, 12, 0, 0);
  affirmer_(formaterDateFr_(objetDate) === '15/01/2024', `Attendu 15/01/2024 pour Date, obtenu : ${formaterDateFr_(objetDate)}`);
  affirmer_(formaterDateFr_('2024-01-15') === '15/01/2024', `Attendu 15/01/2024 pour chaîne ISO, obtenu : ${formaterDateFr_('2024-01-15')}`);
  affirmer_(formaterDateFr_('15/01/2024') === '15/01/2024', `Attendu 15/01/2024 pour chaîne FR, obtenu : ${formaterDateFr_('15/01/2024')}`);
}

function test_CA04_calculKpiTableauDeBord() {
  const kpi = mettreAJourTableauDeBord();
  affirmer_(typeof kpi.goLiberes === 'number' && !Number.isNaN(kpi.goLiberes), 'Le KPI goLiberes doit être un nombre valide.');
  affirmer_(typeof kpi.co2EviteKg === 'number' && !Number.isNaN(kpi.co2EviteKg), 'Le KPI co2EviteKg doit être un nombre valide.');
}

function test_CA05_constantesColonnes() {
  affirmer_(typeof COLONNES_INVENTAIRE.ID === 'number', 'COLONNES_INVENTAIRE.ID doit être défini');
  affirmer_(COLONNES_INVENTAIRE.DOSSIER_PARENT === 6, 'COLONNES_INVENTAIRE.DOSSIER_PARENT doit être à l\'indice 6');
  affirmer_(COLONNES_INVENTAIRE.URL === 7, 'COLONNES_INVENTAIRE.URL doit être à l\'indice 7');
  affirmer_(COLONNES_INVENTAIRE.DATE_TRAITEMENT === COLONNES_INVENTAIRE.STATUT + 1, 'Statut et Date_Traitement doivent être adjacents (écriture groupée).');
  affirmer_(typeof COLONNES_LISTE_BLANCHE.MOTIF === 'number', 'COLONNES_LISTE_BLANCHE.MOTIF doit être défini');
}

function test_CA05_declencheursDistincts() {
  affirmer_(FONCTIONS_DECLENCHEURS.REPRISE_AUDIT !== FONCTIONS_DECLENCHEURS.CAMPAGNE_MENSUELLE,
    'La reprise et la campagne mensuelle doivent cibler deux fonctions distinctes.');
  affirmer_(typeof reprendreAuditDrive === 'function' && typeof executerCampagneMensuelle === 'function',
    'Les fonctions cibles des déclencheurs doivent exister.');
}

function test_CA06_retryBackoff() {
  let compteur = 0;
  const resultat = executerAvecRetry_(() => {
    compteur++;
    if (compteur < 2) {
      throw new Error('429 Too Many Requests (simulation test)');
    }
    return 'succes';
  }, 3, 50);
  affirmer_(resultat === 'succes', 'executerAvecRetry_ doit réussir après un retry simulé');
  affirmer_(compteur === 2, `Deux tentatives attendues, obtenues : ${compteur}`);
}

function test_CA06_retryErreurDefinitive() {
  let compteur = 0;
  try {
    executerAvecRetry_(() => {
      compteur++;
      throw new Error('File not found: abc (simulation test, code 404)');
    }, 3, 10);
  } catch (erreur) {
    // attendu
  }
  affirmer_(compteur === 1, `Une erreur définitive ne doit pas être rejouée (tentatives : ${compteur}).`);
}

function test_CA07_marqueurGarder() {
  affirmer_(estFichierGarde_({ properties: { driveSleepConserver: '1' } }) === true, 'Un fichier marqué (properties) doit être reconnu comme gardé.');
  affirmer_(estFichierGarde_({ appProperties: { driveSleepConserver: '1' } }) === true, 'Un ancien marquage (appProperties) doit rester reconnu.');
  affirmer_(estFichierGarde_({ appProperties: {} }) === false, 'Un fichier sans marqueur ne doit pas être gardé.');
  affirmer_(estFichierGarde_({}) === false, 'Un fichier sans appProperties ne doit pas être gardé.');
}

function test_CA07_dateLimiteClientValidee() {
  affirmer_(FORMAT_DATE_ISO_STRICT.test(new Date().toISOString()), 'Une date ISO générée par le serveur doit être acceptée.');
  affirmer_(!FORMAT_DATE_ISO_STRICT.test("2020-01-01T00:00:00Z' or name contains 'x"), 'Une tentative d\'injection dans la requête Drive doit être refusée.');
}

function test_CA08_dateLimiteFinDeMois() {
  const limite = calculerDateLimite_(8, new Date(2026, 9, 31, 12, 0, 0)); // 31 octobre 2026 - 8 mois
  affirmer_(limite.getMonth() === 1 && limite.getDate() === 28, `Attendu 28 février, obtenu : ${limite.getDate()}/${limite.getMonth() + 1}`);
  const simple = calculerDateLimite_(12, new Date(2026, 9, 15, 12, 0, 0));
  affirmer_(simple.getFullYear() === 2025 && simple.getMonth() === 9 && simple.getDate() === 15, 'Attendu 15 octobre 2025.');
}

function test_CA08_fichierPartageSignale() {
  const config = { ...CONFIGURATION_PAR_DEFAUT };
  const dateLimite = new Date('2025-10-01T00:00:00Z');
  const fichier = { id: 'id_partage', name: 'ref.pdf', mimeType: 'application/pdf', size: String(10 * 1024 * 1024), modifiedTime: '2022-01-01T00:00:00Z', shared: true };
  const resultat = evaluerEligibiliteFichier_(fichier, config, dateLimite, new Set(), CONTEXTE_TEST_);
  affirmer_(resultat !== null && resultat.partage === true, 'Un fichier partagé doit être signalé comme tel.');
}

function test_CA09_fichierCorbeilleExclu() {
  const config = { ...CONFIGURATION_PAR_DEFAUT };
  const dateLimite = new Date('2025-10-01T00:00:00Z');
  const fichierCorbeille = { id: 'id_corb', name: 'vieux.pdf', mimeType: 'application/pdf', size: String(10 * 1024 * 1024), modifiedTime: '2022-01-01T00:00:00Z', trashed: true };
  affirmer_(evaluerEligibiliteFichier_(fichierCorbeille, config, dateLimite, new Set(), CONTEXTE_TEST_) === null, 'Un fichier avec trashed: true doit être exclu.');

  const fichierExplicitCorbeille = { id: 'id_exp', name: 'vieux2.pdf', mimeType: 'application/pdf', size: String(10 * 1024 * 1024), modifiedTime: '2022-01-01T00:00:00Z', explicitlyTrashed: true };
  affirmer_(evaluerEligibiliteFichier_(fichierExplicitCorbeille, config, dateLimite, new Set(), CONTEXTE_TEST_) === null, 'Un fichier avec explicitlyTrashed: true doit être exclu.');
}

function test_CA10_formuleDossierParent() {
  const racine = formaterFormuleDossierParentDefaut_({});
  affirmer_(racine.includes('https://drive.google.com/drive/my-drive') && racine.includes('"Mon Drive")'), 'Sans parent, le lien doit pointer vers Mon Drive');

  const racineRoot = formaterFormuleDossierParentDefaut_({ parents: ['root'] });
  affirmer_(racineRoot.includes('https://drive.google.com/drive/my-drive') && racineRoot.includes('"Mon Drive")'), 'Le dossier root doit pointer vers Mon Drive');

  const dossierSimple = formaterFormuleDossierParentDefaut_({ parents: ['folder_123'] });
  affirmer_(dossierSimple.includes('https://drive.google.com/drive/folders/folder_123') && dossierSimple.includes('"Dossier")'), 'Par défaut, le dossier parent doit avoir le nom Dossier');

  const dossierNomme = formaterFormuleDossierParentDefaut_({ parents: ['folder_456'], parentName: 'Rapports "Financiers"' });
  affirmer_(dossierNomme.includes('https://drive.google.com/drive/folders/folder_456') && dossierNomme.includes('"Rapports ""Financiers"""'), 'Les guillemets du nom de dossier doivent être échappés en double');

  const sep = obtenirSeparateurFormule_();
  const cache = new Map([['folder_cached', `=HYPERLINK("https://drive.google.com/drive/folders/folder_cached"${sep} "CacheTest")`]]);
  const depuisCache = resoudreFormuleDossierParent_({ parents: ['folder_cached'] }, cache);
  affirmer_(depuisCache === `=HYPERLINK("https://drive.google.com/drive/folders/folder_cached"${sep} "CacheTest")`, 'Le cache mémoire doit être prioritaire');
}

function test_CA11_protectionNomCommeFormule() {
  affirmer_(protegerTexteCellule_('=IMPORTXML("x","y")') === '\'=IMPORTXML("x","y")', 'Un nom commençant par = doit être neutralisé.');
  affirmer_(protegerTexteCellule_('-2023 budget') === "'-2023 budget", 'Un nom commençant par - doit être neutralisé.');
  affirmer_(protegerTexteCellule_('+33 contacts') === "'+33 contacts", 'Un nom commençant par + doit être neutralisé.');
  affirmer_(protegerTexteCellule_('Rapport 2024.pdf') === 'Rapport 2024.pdf', 'Un nom ordinaire ne doit pas être modifié.');
  affirmer_(protegerTexteCellule_(42) === 42, 'Une valeur non textuelle ne doit pas être modifiée.');
}

function test_CA11_schemaInventaireControle() {
  const fausseFeuille = (enTetes) => ({
    getLastRow: () => 2,
    getLastColumn: () => enTetes.length,
    getRange: () => ({ getValues: () => [enTetes] })
  });
  schemaInventaireVerifie_ = false;
  verifierSchemaInventaire_(fausseFeuille(ENTETES_INVENTAIRE.slice()));
  schemaInventaireVerifie_ = false;
  let erreurLevee = false;
  try {
    verifierSchemaInventaire_(fausseFeuille(ENTETES_INVENTAIRE_V1.slice()));
  } catch (erreur) {
    erreurLevee = /format attendu/.test(erreur.message);
  }
  schemaInventaireVerifie_ = false;
  affirmer_(erreurLevee, 'Un inventaire non migré doit bloquer la lecture avec un message explicite.');
}

function test_CA12_chargementInventaireConsole() {
  // Test extraction nom dossier parent
  affirmer_(extraireNomDossierParent_('Mon Dossier') === 'Mon Dossier', 'Un nom brut doit être renvoyé tel quel');
  affirmer_(extraireNomDossierParent_('=HYPERLINK("https://drive.google.com/folders/123", "Dossier Racine")') === 'Dossier Racine', 'Le nom doit être extrait de la formule HYPERLINK');
  affirmer_(extraireNomDossierParent_('=LIEN_HYPERTEXTE("https://drive.google.com"; "Dossier ""2023""")') === 'Dossier "2023"', 'Les guillemets doublés doivent être dédoublés');
  affirmer_(extraireNomDossierParent_('') === '', 'Une valeur vide doit renvoyer une chaîne vide');

  // Test du filtrage statut et tri par taille
  const faussesLignes = [
    ['id_1', 'Petit.pdf', 'application/pdf', 2, new Date('2023-01-01'), 'user@test.fr', 'Dossier A', 'https://...', STATUTS_FICHIER.DORMANT, ''],
    ['id_2', 'Gros.zip', 'application/zip', 150, new Date('2023-02-01'), 'user@test.fr', 'Dossier B', 'https://...', STATUTS_FICHIER.NOTIFIE, ''],
    ['id_3', 'DejaCorbeille.pdf', 'application/pdf', 50, new Date('2023-01-01'), 'user@test.fr', 'Dossier C', 'https://...', STATUTS_FICHIER.CORBEILLE, new Date()],
    ['id_4', 'Garde.pdf', 'application/pdf', 80, new Date('2023-01-01'), 'user@test.fr', 'Dossier D', 'https://...', STATUTS_FICHIER.LISTE_BLANCHE, new Date()]
  ];

  const ancienneFonction = typeof lireLignesInventaire_ === 'function' ? lireLignesInventaire_ : null;
  try {
    lireLignesInventaire_ = () => faussesLignes;
    const res = chargerMesFichiersInventaire();
    affirmer_(res.source === 'INVENTAIRE', 'La source doit être INVENTAIRE');
    affirmer_(res.fichiers.length === 2, `Seuls les fichiers DORMANT et NOTIFIE doivent être chargés (obtenu : ${res.fichiers.length})`);
    affirmer_(res.fichiers[0].id === 'id_2' && res.fichiers[0].tailleMo === 150, 'Les fichiers doivent être triés par taille décroissante');
    affirmer_(res.fichiers[1].id === 'id_1' && res.fichiers[1].tailleMo === 2, 'Le deuxième fichier doit être le plus petit');
    affirmer_(res.fichiers[0].dossierParent === 'Dossier B', 'Le nom du dossier parent doit être extrait');
  } finally {
    if (ancienneFonction) lireLignesInventaire_ = ancienneFonction;
  }
}

