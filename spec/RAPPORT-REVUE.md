# Revue — Drive Sleep & Green FinOps v1.3.1

**Date** : 18/10/2026 · **Type** : script lié à Google Sheets (menu, console modale, déclencheurs temporels)
**Fichiers analysés** : Config.gs, Main.gs, DriveService.gs, LibreService.gs, SheetService.gs, MailService.gs, Tests.gs, Ui.html, appsscript.json
**Verdict** : le code est sain et prêt pour un usage en production **dans le périmètre décrit ci-dessous**. Cette relecture a fait apparaître quatre défauts, tous corrigés : un risque de coupure à 6 minutes, une campagne qui pouvait s'arrêter sans prévenir, un message d'erreur trompeur dans la console, et l'absence d'alerte sur les fichiers partagés. Les 16 tests passent dans un banc d'essai avec services Google simulés. Le code n'a pas encore tourné dans Apps Script.

## Périmètre réel de l'outil (à afficher clairement)

| Usage | Couvert ? |
|---|---|
| Un administrateur audite **son propre Drive**, reçoit son bilan et trie depuis la console | ✅ |
| Un éditeur du classeur trie **son propre Drive** depuis la console | ✅ |
| Audit **de tout le domaine** et bilans envoyés à chaque collaborateur | ❌ La requête `'me' in owners` ne voit que le Drive de l'utilisateur effectif. Il faudrait un compte de service avec délégation au niveau du domaine. |
| Drive partagés | ❌ Exclus volontairement (`includeItemsFromAllDrives: false`) |

## 🔴 Bloquant — corrigé

- **L'envoi des bilans pouvait être coupé par la limite des 6 minutes** — `DriveService.gs`, fin de `executerCycleAudit_`
  L'envoi démarrait à la fin de l'audit (vers 4 minutes), avec son propre budget de 4 min 30. Au-delà de 6 minutes au total, Apps Script tuait l'exécution : une partie des e-mails était partie mais aucun statut `NOTIFIE` n'était enregistré, donc ces e-mails partaient une seconde fois au passage suivant.
  → L'envoi passe dans un déclencheur ponctuel séparé, `envoyerBilansCampagne`, lancé une minute plus tard. Le déclencheur se supprime lui-même.

## 🟠 Important — corrigé

- **Une campagne pouvait s'arrêter sans prévenir** — `DriveService.gs:lancerAuditDrive`
  Si une reprise échouait (Drive indisponible, jeton expiré), aucune nouvelle reprise n'était planifiée. Les bilans du mois n'étaient alors jamais envoyés.
  → Nouvelle reprise automatique, trois tentatives au maximum (`MAX_ECHECS_REPRISE`). Ensuite, le statut de campagne passe à `ECHEC`.
- **Les fichiers partagés étaient traités comme les autres** — `viewedByMeTime` ne voit que **vos** consultations.
  Un PDF de référence consulté chaque jour par l'équipe, mais ni modifié ni rouvert par son propriétaire depuis 12 mois, apparaissait comme « en sommeil ». Le mettre à la corbeille coupe l'accès à tout le monde.
  → Le champ `shared` est maintenant lu. Ces fichiers portent un badge « 👥 Partagé » et la confirmation indique combien de fichiers partagés sont concernés. Une question a été ajoutée à la FAQ.
- **Message trompeur en cas d'erreur** — `Ui.html`
  Si l'analyse échouait dès le premier appel, la console affichait « Bravo, aucun fichier en sommeil ».
  → La console affiche maintenant l'erreur, avec un bouton pour relancer l'analyse.

## 🟡 Mineur — corrigé

- **Date limite mal calculée en fin de mois** : avec `setMonth`, le 31 octobre moins 8 mois donnait le 3 mars au lieu du 28 février. Le calcul passe par `calculerDateLimite_`, qui est testée.
- **Libellés** : « Libéré aujourd'hui » devient « Libéré pendant cette session ». La FAQ disait que « Garder » ne modifie pas le fichier ; elle précise maintenant que le contenu reste intact et qu'une étiquette invisible est ajoutée.
- **Tests** : 16 tests au total, dont 2 nouveaux (date de fin de mois, signalement des fichiers partagés).

## Vérifié, conforme

- **Six minutes** : l'audit a un budget de 4 min, la console 20 s par appel, et chaque lot de décisions 4 min pour 100 fichiers au maximum.
- **Déclencheurs** : reprise, campagne mensuelle et envoi des bilans ciblent trois fonctions distinctes. Aucune suppression n'en touche une autre.
- **Concurrence** : verrou logique sur l'audit. Toutes les écritures de statuts passent par `appliquerStatutsParId_`, sous verrou de script, et seules les colonnes Statut et Date sont écrites.
- **Sécurité** : la propriété de chaque fichier est revérifiée auprès de Drive (`ownedByMe`) avant toute action. La date renvoyée par la console est validée avant d'entrer dans la requête Drive. Les e-mails sont échappés et les liens filtrés (`https://` uniquement). Les fonctions d'administration sont protégées par `exigerAdministrateur_`.
- **Idempotence** : les ID déjà inventoriés sont exclus. Les fichiers gardés sont exclus via `properties`, et cette exclusion ne dépend pas d'un projet Cloud.

## Revue des commits 3a06adb et fde1db8 (v1.3.1) — corrigé

- 🔴 **Risque de coupure à 6 min** : jusqu'à trois appels Drive par nouveau dossier, avec un temps vérifié seulement entre les pages. → Un cache unique, des pages de 200 fichiers, un garde-fou à l'intérieur de chaque page (la page est rejouée si besoin), et le dossier parent résolu uniquement pour les fichiers retenus.
- 🔴 **Vérification de la corbeille par dossier** : redondante avec `trashed = false` et coûteuse. → Retirée.
- 🔴 **Synchronisation de la corbeille sans verrou**, appelée à chaque action de la console via le tableau de bord. → Écriture sous verrou, et appels limités au début de l'audit et de l'envoi des bilans.
- 🟠 **Migration fragile** : elle dépendait du nombre de colonnes et de la présence du mot « dossier ». → Reconnaissance exacte de l'ancien format, et contrôle du format avant chaque lecture ou écriture.
- 🟠 **« Déjà dans l'état visé »** : ces fichiers étaient comptés dans les gains, et « Garder » était accepté sur un fichier à la corbeille. → Liste séparée des fichiers « déjà faits », et refus de « Garder » sur un fichier à la corbeille.
- 🟡 **Noms de fichiers commençant par `=`, `+`, `-` ou `@`** : interprétés par Sheets comme formules ou nombres (défaut présent avant ces commits). → Valeur préfixée par une apostrophe.

Validation : 20 tests sur 20, plus six scénarios simulés (migration, format inconnu bloqué, audit avec un seul appel Drive par dossier, abandon et reprise de page, fichier déjà à la corbeille, « Garder » refusé).

## Limites connues — à ta main

1. **Les éditeurs du classeur peuvent modifier le script.** Avec un script lié à un classeur, toute personne ayant le droit de modifier le classeur peut ouvrir l'éditeur Apps Script. `exigerAdministrateur_` est une protection de second niveau, pas une frontière de sécurité. Il ne faut donner l'accès en écriture qu'à des personnes de confiance. Pour une diffusion large, il faudrait une autre architecture : web app ou module complémentaire.
2. **L'inventaire n'est que partiellement revérifié.** Les fichiers mis à la corbeille hors de l'outil sont maintenant détectés, et comptés dans les gains : à assumer, ou à distinguer par un statut à part. En revanche, un fichier rouvert, restauré ou supprimé définitivement garde son ancien statut.
3. **Consultations par d'autres personnes** : seule l'API Drive Activity permettrait de les mesurer finement. Pour l'instant, c'est l'avertissement « Partagé » qui couvre ce risque.
4. **Hypothèses des indicateurs** : le facteur de 0,2 kgCO2e/Go/an est à sourcer dans le README. Par ailleurs, un fichier dans la corbeille compte encore dans le quota pendant 30 jours.
5. **`runAllTests`** écrit dans le classeur (tests CA01 et CA04). Il vaut mieux le lancer sur une copie du classeur.
