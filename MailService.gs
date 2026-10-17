/**
 * @fileoverview Envoi des bilans de sobriété numérique par propriétaire.
 * Projet : Drive Sleep & Green FinOps (workspace-drive-sleep)
 * Auteur : Fabrice Faucheux (FF Labs - faucheux.bzh)
 */

const NB_MAX_FICHIERS_PAR_EMAIL = 15;
const DUREE_MAX_ENVOI_MS = 270000;

/**
 * Regroupe les fichiers au statut DORMANT par propriétaire et leur envoie un bilan bilingue.
 * Les lignes sans propriétaire valide sont ignorées et signalées (jamais réattribuées).
 * @param {Object} [options] Options d'envoi { forcerRenvoi: boolean }
 * @returns {Object} Bilan (emailsEnvoyes, nbDormants, nbDejaNotifies, nbSansProprietaire,
 *   quotaRestant, proprietairesTrouves, proprietairesRestants, erreurs).
 */
function envoyerNotificationsProprietaires(options = {}) {
  const debut = Date.now();
  const forcerRenvoi = Boolean(options && options.forcerRenvoi === true);
  const config = lireConfiguration();
  const lignes = lireLignesInventaire_();
  const parProprietaire = new Map();

  let nbDormants = 0;
  let nbDejaNotifies = 0;
  let nbSansProprietaire = 0;

  lignes.forEach((ligne) => {
    const statut = String(ligne[COLONNES_INVENTAIRE.STATUT] ?? '').trim().toUpperCase();
    const proprietaire = String(ligne[COLONNES_INVENTAIRE.PROPRIETAIRE] ?? '').trim().toLowerCase();

    if (statut === STATUTS_FICHIER.DORMANT) {
      nbDormants++;
    } else if (statut === STATUTS_FICHIER.NOTIFIE) {
      nbDejaNotifies++;
    }

    const estEligible = (statut === STATUTS_FICHIER.DORMANT) || (forcerRenvoi && statut === STATUTS_FICHIER.NOTIFIE);
    if (!estEligible) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(proprietaire)) {
      nbSansProprietaire++;
      return;
    }
    if (!parProprietaire.has(proprietaire)) {
      parProprietaire.set(proprietaire, []);
    }
    parProprietaire.get(proprietaire).push(ligne);
  });

  let quotaRestant = MailApp.getRemainingDailyQuota();
  let emailsEnvoyes = 0;
  let proprietairesRestants = 0;
  const erreurs = [];
  const idsNotifies = new Map();
  const urlConsole = obtenirUrlConsole_();

  parProprietaire.forEach((elements, email) => {
    if (quotaRestant <= 1 || (Date.now() - debut) > DUREE_MAX_ENVOI_MS) {
      proprietairesRestants++;
      return;
    }
    try {
      const message = construireMessageBilan_(elements, config, urlConsole);
      MailApp.sendEmail({
        to: email,
        subject: message.sujet,
        body: message.texte,
        htmlBody: message.html,
        name: CONFIGURATION_PAR_DEFAUT.NOM_APPLICATION
      });
      elements.forEach((ligne) => {
        idsNotifies.set(String(ligne[COLONNES_INVENTAIRE.ID]).trim(), { statut: STATUTS_FICHIER.NOTIFIE });
      });
      quotaRestant--;
      emailsEnvoyes++;
    } catch (erreurEnvoi) {
      const msg = `Échec d'envoi à ${email} : ${erreurEnvoi.message}`;
      console.warn(msg);
      erreurs.push(msg);
    }
  });

  if (proprietairesRestants > 0) {
    erreurs.push(`${proprietairesRestants} propriétaire(s) non notifié(s) (quota e-mail ou temps d'exécution) : relancez l'envoi plus tard.`);
  }

  if (idsNotifies.size > 0) {
    const verrou = LockService.getScriptLock();
    if (verrou.tryLock(30000)) {
      try {
        // Ne touche que les lignes encore DORMANT/NOTIFIE : une mise à la corbeille concurrente est préservée.
        appliquerStatutsParId_(idsNotifies, [STATUTS_FICHIER.DORMANT, STATUTS_FICHIER.NOTIFIE]);
      } finally {
        verrou.releaseLock();
      }
    } else {
      erreurs.push('Bilans envoyés mais statuts NOTIFIE non enregistrés (feuille verrouillée).');
    }
  }

  return {
    emailsEnvoyes,
    nbDormants,
    nbDejaNotifies,
    nbSansProprietaire,
    quotaRestant,
    proprietairesTrouves: parProprietaire.size,
    proprietairesRestants,
    erreurs
  };
}

/**
 * Renvoie l'URL de la console (Web App déployée) ou, à défaut, celle du classeur.
 * @returns {string} URL.
 */
function obtenirUrlConsole_() {
  try {
    const url = ScriptApp.getService().getUrl();
    if (url) return url;
  } catch (erreur) {
    console.warn('Web App non déployée, lien vers le classeur utilisé.');
  }
  return obtenirClasseurMaitre_().getUrl();
}

/**
 * Construit le sujet, le corps texte et le corps HTML du bilan d'un propriétaire.
 * @param {Array<Array<*>>} elements Lignes d'inventaire du propriétaire.
 * @param {Object} config Configuration consolidée.
 * @param {string} urlConsole Lien vers la console de tri.
 * @returns {{sujet: string, texte: string, html: string}}
 */
function construireMessageBilan_(elements, config, urlConsole) {
  const totalMo = elements.reduce((acc, ligne) => acc + (Number(ligne[COLONNES_INVENTAIRE.TAILLE_MO]) || 0), 0);
  const totalGo = (totalMo / 1024).toFixed(2);
  const totalCo2 = ((totalMo / 1024) * config.FACTEUR_CO2_KG_PAR_GO_AN * 1000).toFixed(0);
  const nbMasques = Math.max(0, elements.length - NB_MAX_FICHIERS_PAR_EMAIL);

  const lignesHtml = elements.slice(0, NB_MAX_FICHIERS_PAR_EMAIL).map((ligne) => {
    const url = String(ligne[COLONNES_INVENTAIRE.URL] ?? '');
    const urlSure = /^https:\/\//i.test(url) ? url : '#';
    return `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee;"><a href="${echapperHtml_(urlSure)}" style="color:#1a73e8;text-decoration:none;">${echapperHtml_(ligne[COLONNES_INVENTAIRE.NOM])}</a></td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${echapperHtml_(ligne[COLONNES_INVENTAIRE.TAILLE_MO])} Mo</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${echapperHtml_(formaterDateFr_(ligne[COLONNES_INVENTAIRE.DERNIERE_ACTIVITE]))}</td>
      </tr>`;
  }).join('');

  const ligneMasques = nbMasques > 0
    ? `<p style="color:#5f6368;font-size:13px;">… et ${nbMasques} autre(s) fichier(s) à consulter dans la console / … and ${nbMasques} more in the console.</p>`
    : '';

  const html = `
      <div style="font-family:'Google Sans',Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;color:#202124;border:1px solid #dadce0;border-radius:8px;padding:24px;">
        <h2 style="color:#188038;margin-top:0;">🌱 Bilan de sobriété numérique / Digital Sobriety Digest</h2>
        <p>Bonjour,</p>
        <p>Nous avons identifié <strong>${elements.length} fichier(s) dormant(s)</strong> dans votre Google Drive (sans activité depuis plus de ${config.SEUIL_INACTIVITE_MOIS} mois), représentant <strong>${totalMo.toFixed(1)} Mo (${totalGo} Go)</strong> soit environ <strong>${totalCo2} gCO2e/an</strong>.</p>
        <p style="color:#5f6368;font-size:13px;"><em>EN: We identified <strong>${elements.length} dormant file(s)</strong> in your Google Drive (no activity for over ${config.SEUIL_INACTIVITE_MOIS} months), representing <strong>${totalMo.toFixed(1)} MB</strong> (~${totalCo2} gCO2e/year).</em></p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
          <thead>
            <tr style="background:#f1f3f4;">
              <th style="padding:8px;text-align:left;">Fichier / File</th>
              <th style="padding:8px;text-align:right;">Taille / Size</th>
              <th style="padding:8px;text-align:center;">Dernière activité / Last activity</th>
            </tr>
          </thead>
          <tbody>${lignesHtml}</tbody>
        </table>
        ${ligneMasques}
        <div style="margin-top:24px;text-align:center;">
          <a href="${echapperHtml_(urlConsole)}" style="background:#188038;color:#ffffff;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:500;display:inline-block;">Ouvrir la console de tri / Open cleanup console</a>
        </div>
        <p style="color:#5f6368;font-size:12px;margin-top:24px;text-align:center;">${echapperHtml_(CONFIGURATION_PAR_DEFAUT.NOM_APPLICATION)} — FF Labs · <a href="${CONFIGURATION_PAR_DEFAUT.SITE_WEB}" style="color:#5f6368;">faucheux.bzh</a></p>
      </div>
    `;

  const texte = '🌱 Bilan de sobriété numérique / Digital Sobriety Digest\n\n' +
    'Bonjour,\n\n' +
    `Nous avons identifié ${elements.length} fichier(s) dormant(s) dans votre Google Drive (${totalMo.toFixed(1)} Mo / ${totalGo} Go), représentant environ ${totalCo2} gCO2e/an.\n\n` +
    `Ouvrir la console de tri / Open cleanup console : ${urlConsole}\n`;

  return {
    sujet: `🌱 [Sobriété Numérique] ${elements.length} fichier(s) en sommeil (${totalMo.toFixed(1)} Mo)`,
    texte,
    html
  };
}

/**
 * Échappe les caractères spéciaux HTML pour prévenir toute injection.
 * @param {*} texte Valeur à échapper.
 * @returns {string} Texte échappé.
 */
function echapperHtml_(texte) {
  return String(texte ?? '')
    .replace(/&/g, () => '&amp;')
    .replace(/</g, () => '&lt;')
    .replace(/>/g, () => '&gt;')
    .replace(/"/g, () => '&quot;')
    .replace(/'/g, () => '&#39;');
}

/**
 * Formate une date (objet Date de Google Sheets, format JJ/MM/AAAA ou chaîne ISO YYYY-MM-DD) en JJ/MM/AAAA.
 * @param {Date|string|*} valeurDate Valeur issue de la feuille Google Sheets.
 * @returns {string} Date formatée en JJ/MM/AAAA (ex. 15/01/2024).
 */
function formaterDateFr_(valeurDate) {
  if (!valeurDate) return '-';
  const fuseau = obtenirFuseau_();
  if (Object.prototype.toString.call(valeurDate) === '[object Date]' && !Number.isNaN(valeurDate.getTime())) {
    return Utilities.formatDate(valeurDate, fuseau, 'dd/MM/yyyy');
  }
  const chaine = String(valeurDate).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(chaine)) {
    return chaine;
  }
  const correspondanceIso = chaine.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (correspondanceIso) {
    return `${correspondanceIso[3]}/${correspondanceIso[2]}/${correspondanceIso[1]}`;
  }
  const dateParsee = new Date(chaine);
  if (!Number.isNaN(dateParsee.getTime())) {
    return Utilities.formatDate(dateParsee, fuseau, 'dd/MM/yyyy');
  }
  return chaine;
}
