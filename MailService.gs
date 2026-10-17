/**
 * @fileoverview Envoi des bilans mensuels de sobriété numérique par propriétaire.
 */

/**
 * Regroupe les fichiers au statut DORMANT par propriétaire et leur envoie un bilan bilingue.
 * Vérifie préalablement le quota journalier MailApp.
 * @returns {Object} Nombre de notifications envoyées.
 */
function envoyerNotificationsProprietaires() {
  const classeur = obtenirClasseurMaitre_();
  const feuilleInv = classeur.getSheetByName(NOMS_FEUILLES.INVENTAIRE);
  if (!feuilleInv || feuilleInv.getLastRow() < 2) {
    return { emailsEnvoyes: 0 };
  }

  const config = lireConfiguration();
  const nbColonnes = Object.keys(COLONNES_INVENTAIRE).length;
  const plage = feuilleInv.getRange(2, 1, feuilleInv.getLastRow() - 1, nbColonnes);
  const lignes = plage.getValues();
  const parProprietaire = new Map();

  lignes.forEach((ligne, index) => {
    const statut = String(ligne[COLONNES_INVENTAIRE.STATUT] ?? '').trim();
    const proprietaire = String(ligne[COLONNES_INVENTAIRE.PROPRIETAIRE] ?? '').trim();
    if (statut === STATUTS_FICHIER.DORMANT && proprietaire.includes('@')) {
      if (!parProprietaire.has(proprietaire)) {
        parProprietaire.set(proprietaire, []);
      }
      parProprietaire.get(proprietaire).push({ indexLigne: index, donnees: ligne });
    }
  });

  let quotaRestant = MailApp.getRemainingDailyQuota();
  let emailsEnvoyes = 0;
  let urlWebApp = '';
  try {
    urlWebApp = ScriptApp.getService().getUrl() || classeur.getUrl();
  } catch (e) {
    urlWebApp = classeur.getUrl();
  }

  parProprietaire.forEach((elements, email) => {
    if (quotaRestant <= 1) {
      console.warn('Quota d\'envoi d\'e-mails presque épuisé, arrêt des envois.');
      return;
    }

    const totalMo = elements.reduce((acc, el) => acc + (Number(el.donnees[COLONNES_INVENTAIRE.TAILLE_MO]) || 0), 0);
    const totalGo = (totalMo / 1024).toFixed(2);
    const totalCo2 = ((totalMo / 1024) * config.FACTEUR_CO2_KG_PAR_GO_AN * 1000).toFixed(0);

    const lignesHtml = elements.slice(0, 15).map((el) => {
      const nom = el.donnees[COLONNES_INVENTAIRE.NOM];
      const tailleMo = el.donnees[COLONNES_INVENTAIRE.TAILLE_MO];
      const dateAct = el.donnees[COLONNES_INVENTAIRE.DERNIERE_ACTIVITE];
      const url = el.donnees[COLONNES_INVENTAIRE.URL];
      const dateFormatee = formaterDateFr_(dateAct);
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee;"><a href="${url}" style="color:#1a73e8;text-decoration:none;">${echapperHtml_(String(nom))}</a></td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${tailleMo} Mo</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${echapperHtml_(dateFormatee)}</td>
      </tr>`;
    }).join('');

    const corpsHtml = `
      <div style="font-family:'Google Sans',Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;color:#202124;border:1px solid #dadce0;border-radius:8px;padding:24px;">
        <h2 style="color:#188038;margin-top:0;">🌱 Bilan de sobriété numérique / Digital Sobriety Digest</h2>
        <p>Bonjour,</p>
        <p>Nous avons identifié <strong>${elements.length} fichier(s) dormant(s)</strong> dans votre Google Drive (sans activité depuis plus de ${config.SEUIL_INACTIVITE_MOIS} mois), représentant <strong>${totalMo.toFixed(1)} Mo (${totalGo} Go)</strong> soit environ <strong>${totalCo2} gCO2e/an</strong>.</p>
        <p style="color:#5f6368;font-size:13px;"><em>EN: We identified <strong>${elements.length} dormant file(s)</strong> in your Google Drive, representing <strong>${totalMo.toFixed(1)} MB</strong> (~${totalCo2} gCO2e/year).</em></p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
          <thead>
            <tr style="background:#f1f3f4;">
              <th style="padding:8px;text-align:left;">Fichier / File</th>
              <th style="padding:8px;text-align:right;">Taille / Size</th>
              <th style="padding:8px;text-align:center;">Dernière activité</th>
            </tr>
          </thead>
          <tbody>${lignesHtml}</tbody>
        </table>
        <div style="margin-top:24px;text-align:center;">
          <a href="${urlWebApp}" style="background:#188038;color:#ffffff;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:500;display:inline-block;">Ouvrir la console de tri / Open cleanup console</a>
        </div>
      </div>
    `;

    try {
      MailApp.sendEmail({
        to: email,
        subject: `🌱 [Sobriété Numérique] ${elements.length} fichier(s) en sommeil (${totalMo.toFixed(1)} Mo)`,
        htmlBody: corpsHtml
      });

      elements.forEach((el) => {
        lignes[el.indexLigne][COLONNES_INVENTAIRE.STATUT] = STATUTS_FICHIER.NOTIFIE;
      });

      quotaRestant--;
      emailsEnvoyes++;
    } catch (erreurEnvoi) {
      console.warn(`Échec de l'envoi d'e-mail à ${email} :`, erreurEnvoi.message);
    }
  });

  if (emailsEnvoyes > 0) {
    plage.setValues(lignes);
  }
  return { emailsEnvoyes };
}

/**
 * Échappe les caractères spéciaux HTML pour prévenir toute injection.
 * @param {string} texte
 * @returns {string}
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
  const fuseau = Session.getScriptTimeZone() || 'Europe/Paris';
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
