# Revue — Drive Sleep & Green FinOps (v1.1.0 → v1.2.0)

**Type** : script lié à Sheets + application web (doGet) + déclencheurs temporels
**Fichiers analysés** : appsscript.json, Config.gs, Main.gs, DriveService.gs, SheetService.gs, MailService.gs, Tests.gs, Ui.html, spec/*.md
**Verdict** : le code est propre et bien découpé, mais trois défauts de flux cassent la promesse « campagne mensuelle automatique avec reprise », et la console n'applique aucun contrôle d'autorisation côté serveur. Le vrai risque est ailleurs : l'architecture actuelle ne passe pas à l'échelle d'un domaine (voir *Points à ta main*, point 1). C'est à trancher avant tout déploiement chez Cooperl.

## 🔴 Bloquant

- **Le déclencheur mensuel s'autodétruit** — `Main.gs:213`, `Main.gs:238`, `DriveService.gs:155`
  La reprise et le déclencheur mensuel ciblent tous les deux `lancerAuditDrive`, et `supprimerDeclencheursReprise_('lancerAuditDrive')` supprime **tous** les déclencheurs de cette fonction. Le mensuel disparaît donc à la première fin d'audit (ou dès qu'une reprise est planifiée), y compris après un audit lancé à la main. Dans l'autre sens, réinstaller le mensuel tue une reprise en cours.
  → Deux fonctions cibles distinctes (`reprendreAuditDrive`, `executerCampagneMensuelle`) et une suppression par fonction. `installerDeclencheurMensuel` nettoie aussi les anciens déclencheurs v1.1.

- **Le jeton de page Drive est rejoué avec une autre requête** — `DriveService.gs:93-101`
  `dateLimite = new Date() - N mois` est recalculée à chaque reprise, donc le `q` change d'une minute à l'autre alors que le `pageToken` est lié à la requête d'origine. Selon Drive, ça donne une erreur 400 ou une pagination incohérente (trous ou doublons). Si le jeton expire, la campagne reste bloquée en `EN_COURS` indéfiniment.
  → `DATE_LIMITE_AUDIT` est stockée avec le jeton et réutilisée. Un jeton invalide réinitialise proprement la campagne (sans doublon, puisque les ID déjà inventoriés sont exclus).

- **La mise à la corbeille en masse dépasse les 6 minutes et désynchronise Drive et la feuille** — `DriveService.gs:213-264`
  Tous les `Drive.Files.update` passent en boucle **sous le verrou de script**, avec des retries et des `sleep`, puis il n'y a qu'un seul `setValues` à la fin. Avec quelques centaines de fichiers (300 à 500 ms par appel), l'exécution `google.script.run` atteint le timeout : les fichiers sont dans la corbeille mais la feuille reste à `DORMANT`, donc ils réapparaissent dans la console et dans les e-mails, et les KPI sont faux. Pendant ce temps, les autres utilisateurs reçoivent « Serveur occupé ».
  → Le client envoie des lots de 100 (`TAILLE_LOT_DECISIONS`). Le serveur fait les appels Drive hors verrou avec un budget de temps, puis prend un verrou court pour écrire uniquement Statut et Date_Traitement, ligne par ligne via l'ID.

- **Aucun contrôle d'autorisation côté serveur** — `DriveService.gs:202`, `Main.gs:171`
  `traiterDecisionsUtilisateur` accepte n'importe quelle liste d'ID. N'importe qui sur le domaine peut appeler `google.script.run.traiterDecisionsUtilisateur(...)` depuis la console du navigateur et passer les fichiers d'autres personnes en `LISTE_BLANCHE` (ils sortent alors définitivement de l'audit), ou en `CORBEILLE` pour ceux dont il est éditeur. Par ailleurs, `chargerDonneesConsole` échoue en mode ouvert : `if (!emailActif || …)` renvoie **tout l'inventaire** quand `getActiveUser()` est vide.
  → Un fichier n'est traité que si la ligne appartient à l'utilisateur actif et qu'elle est encore `DORMANT` ou `NOTIFIE`. Sans identité, l'opération est refusée.

## 🟠 Important

- **La liste blanche ne protège pas les sous-dossiers** — `DriveService.gs:30`
  Le code ne vérifie que le parent direct, alors que le README promet de « sanctuariser des dossiers entiers ».
  → `construireVerificateurDossiersProteges_` remonte l'arborescence avec un cache (profondeur max 25, protégé contre les cycles). L'API n'est appelée que si la liste blanche n'est pas vide.

- **Écrasements concurrents de la feuille** — `MailService.gs:177`
  `envoyerNotificationsProprietaires` réécrit **toute** la plage de l'inventaire sans verrou, après des envois qui peuvent durer longtemps. Une mise à la corbeille faite entre-temps dans la console repasse alors en `NOTIFIE`.
  → Une seule fonction d'écriture, `appliquerStatutsParId_`, fait la relecture sous verrou et n'écrit que les deux colonnes de statut. Elle ne remplace que les statuts autorisés.

- **Deux audits en parallèle produisent des doublons** — `DriveService.gs:82`
  Un lancement manuel pendant une reprise planifiée donne deux exécutions qui partent du même jeton et insèrent les mêmes lignes.
  → Verrou logique horodaté dans les propriétés. Il ne bloque pas les utilisateurs de la console, contrairement à un ScriptLock tenu pendant 4 minutes.

- **L'audit automatique supprime des onglets** — `SheetService.gs:19`, `:49`
  `lancerAuditDrive` appelle `initialiserEnvironnement`, qui supprime toute feuille **complètement vide, quel que soit son nom**, à chaque reprise (et aussi `setActiveSheet` depuis un déclencheur). Un onglet « Analyse » créé et pas encore rempli disparaît.
  → Le nettoyage n'a lieu que depuis le menu, et uniquement pour un nom par défaut (`Feuille 1`, `Sheet1`) sur une feuille totalement vide.

- **Les données propriétaire sont corrompues à l'envoi** — `MailService.gs:71-76`
  Une ligne sans propriétaire (ou en `@domaine.local`) est réattribuée à l'utilisateur de la session et **réécrite dans la feuille**. Depuis un déclencheur, c'est le propriétaire du déclencheur qui récupère les fichiers des autres.
  → Ces lignes sont ignorées, comptées (`nbSansProprietaire`) et signalées dans le menu.

- **Dates en texte, interprétées selon les paramètres régionaux** — `DriveService.gs:65`, `:211`
  La chaîne `'01/02/2024'` écrite dans Sheets est convertie selon la locale du classeur : 1er février en FR, 2 janvier en EN.
  → On écrit de vrais objets `Date` avec un format `dd/MM/yyyy` sur les colonnes. `formaterDateFr_` gère déjà les deux cas pour les données existantes.

- **Taille réelle** — `DriveService.gs:49-58`
  `size` ignore les révisions et ne renvoie rien pour les fichiers natifs, d'où le forfait de 2 Mo.
  → `quotaBytesUsed`, ce que Google décompte réellement, est utilisé en priorité. Le forfait ne sert plus que de repli.

- **La configuration de la feuille peut casser l'exécution** — `Config.gs:172-179`
  N'importe quelle clé était acceptée : saisir `DUREE_MAX_EXECUTION_MS = 600000` faisait dépasser les 6 minutes, et `SEUIL_INACTIVITE_MOIS = 0` marquait tout le Drive comme dormant.
  → `PARAMETRES_MODIFIABLES` définit une liste blanche de clés avec des bornes, et le résultat est mis en cache pour l'exécution (avant, la feuille était relue 4 à 5 fois par audit).

- **Retries trop larges** — `DriveService.gs:181-186`
  `includes('500')` correspondait à n'importe quel message contenant « 500 » (ID, nom de fichier), et `includes('quota')` rejouait aussi des quotas journaliers définitifs.
  → Expression régulière stricte sur les codes 429 et 5xx, « rate limit » et « backend error ».

- **Interface : « Tout cocher » et présélection** — `Ui.html`
  Tous les fichiers étaient cochés au chargement et « Tout cocher » ignorait le filtre. Un utilisateur qui filtre sur « pdf » puis clique sur Corbeille supprime aussi les fichiers masqués. Autre bug : après une action, `toutCoche` restait désynchronisé et il fallait cliquer deux fois.
  → Aucune présélection, et la sélection globale ne porte que sur les fichiers affichés. Le filtre est désactivé pendant le traitement.

## 🟡 Harmonisation

- Les en-têtes de module (projet, auteur) sont maintenant présents dans les 6 fichiers .gs, qui avaient tous `@fileoverview` mais pas tous l'auteur. Version passée à 1.2.0.
- `detecterColonnesInventaire_` est supprimée : c'était une détection par sous-chaînes, fragile et contraire au principe de `COLONNES_INVENTAIRE` utilisé partout ailleurs.
- Chaînes de l'interface remises dans `TEXTES_INTERFACE` (« sur un total de », « par an économisés », message de filtre vide, compteurs). `<html lang>` suit maintenant la langue choisie.
- Constantes remontées dans `CONFIG` : `TAILLE_LOT_DECISIONS`, `DUREE_MAX_DECISIONS_MS`, `FONCTIONS_DECLENCHEURS`, etc. Il n'y a plus de `9` en dur dans `enregistrerLotInventaire_`.
- Appels `Session.*` sortis de la boucle de `evaluerEligibiliteFichier_` (paramètre `contexte`). La fonction est ainsi vraiment pure, comme le dit sa JSDoc.
- 4 tests ajoutés (`quotaBytesUsed`, natif sans quota, déclencheurs distincts, erreur définitive sans retry). Les 10 tests unitaires passent en local dans un harnais Node.
- README : lien `file:///Users/fabrice/...` remplacé par un lien relatif, et formulation sur la liste blanche mise à jour. CHANGELOG : entrée 1.2.0.
- Non corrigé, à ta main : `spec/DESIGN.md` mentionne un dossier `src/` qui n'existe pas. `.gitignore` exclut `.claspignore`, alors que ce fichier ne contient rien de sensible et a sa place dans le dépôt. Le README publie de toute façon le `scriptId` que `.gitignore` cherche à cacher.

## Changements de comportement

1. **La campagne mensuelle envoie les bilans e-mail** à la fin de l'audit. Avant, elle ne faisait que l'audit. La spec (§2) demande les deux.
2. **Aucune présélection dans la console**, et « Tout cocher » ne coche que les fichiers filtrés. Avant, tout était coché par défaut.
3. **Taille via `quotaBytesUsed`** : les KPI vont varier. Ils montent pour les binaires qui ont des révisions et deviennent réalistes pour les natifs (souvent quelques Ko au lieu de 2 Mo, et 0 pour les anciens Docs d'avant 2021 qui ne comptent pas dans le quota).
4. **Lignes sans propriétaire valide** : elles sont ignorées à l'envoi au lieu d'être réattribuées à l'utilisateur de la session.
5. **Console sans identité** : erreur affichée au lieu de montrer tout l'inventaire.
6. **Les dates** des nouvelles lignes sont de vraies dates. Les lignes existantes en texte restent lisibles.
7. **`TAILLE_PAGE_DRIVE` passe de 100 à 500** et `DUREE_MAX_EXECUTION_MS` de 270 s à 240 s, pour garder de la marge avec les recherches d'arborescence.
8. Le libellé KPI « Volume total libéré » devient « Volume mis à la corbeille (libéré sous 30 j) ».

## Points à ta main

1. **Architecture : l'outil ne voit que le Drive de la personne qui l'exécute.** C'est le sujet principal.
   - La requête `'me' in owners` ne couvre que le Drive du propriétaire du déclencheur. Tous les e-mails partent donc vers une seule personne, et la colonne Propriétaire contient toujours la même adresse.
   - La web app en `USER_ACCESSING` lit et écrit le classeur maître avec l'identité du visiteur : **chaque utilisateur du domaine doit être éditeur du classeur**. Il peut alors lire l'inventaire de tout le monde dans Sheets, ce qui annule l'« isolation stricte » de la console.
   - Chaque utilisateur doit aussi accepter le scope restreint `auth/drive` sur une application non vérifiée. Côté console d'administration, il faut l'autoriser dans les contrôles d'accès aux API.

   Trois pistes :
   - **(a)** Usage individuel assumé : chaque collaborateur fait une copie de l'outil. C'est le plus simple.
   - **(b)** Audit domaine : compte de service avec délégation au niveau du domaine, avec emprunt d'identité par utilisateur via OAuth2 et l'API REST Drive. L'inventaire central reste réservé aux admins, et la web app passe en `USER_DEPLOYING` avec vérification de `getActiveUser()` côté serveur.
   - **(c)** Hybride : l'audit tourne en `USER_ACCESSING` depuis la web app et ne porte que sur le Drive du visiteur, avec un stockage par utilisateur.

   Pour 8 000 comptes, seule la piste (b) tient la route. Ça représente une vraie refonte, que je n'ai pas lancée sans ton arbitrage.
2. **Les fichiers redevenus actifs restent `DORMANT` à vie.** L'inventaire n'est jamais revérifié, et un fichier ouvert la semaine dernière peut encore être proposé à la corbeille. Option : relire `modifiedTime` et `viewedByMeTime` juste avant `Files.update` (un appel de plus par fichier). De même, un fichier restauré depuis la corbeille n'est plus jamais réaudité.
3. **Honnêteté des KPI FinOps** : un fichier dans la corbeille compte encore dans le quota pendant 30 jours. Faut-il ne comptabiliser le gain qu'à J+30 ?
4. **`runAllTests` dans le menu utilisateur** : `test_CA01` et `test_CA04` écrivent dans le classeur de production. Je l'ai laissé dans le menu, à toi de voir si tu le gardes.
5. **Facteur CO2 de 0,2 kgCO2e/Go/an** : la source n'est pas citée. À sourcer dans le README, car c'est la valeur qui sera contestée en premier.
