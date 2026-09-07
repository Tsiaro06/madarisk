# Assistant IA — sécurité & comportement

Documente l'intégration de l'assistant IA (Gemini) de MadaRisk Map : contexte, renseignement opérationnel et mesures de sécurité.

## Vue d'ensemble

`POST /ai/chat` alimente un agent « renseignement » conscient du contexte : il reçoit une synthèse des **événements actifs**, des **alertes publiées**, des **risques prioritaires** et de la **météo récente**, et répond en langage naturel (français / malgache / anglais) aux questions du style :

> « Quelles communes sont les plus exposées au cyclone actuel ? »

- Modèle : `GEMINI_MODEL` (défaut `gemini-2.0-flash`), clé `GEMINI_API_KEY`.
- **Si la clé n'est pas configurée, l'endpoint répond `503`** (« Assistant IA non configuré ») — l'application ne crash pas.
- Les conversations sont persistées (`ai_conversations`, `ai_messages`) pour permettre le fil de discussion (`conversationId`).

## API

| Méthode | Route | Notes |
|---|---|---|
| POST | `/ai/chat` | `message` requis (1-5000), `conversationId?` — 200 |
| GET | `/ai/conversations` | Liste paginée (limit ≤ 50) |
| GET | `/ai/conversations/:id` | Détail (messages) |
| DELETE | `/ai/conversations/:id` | Suppression — 204 |

## Sécurité

### Politique de sûreté (safety policy)

Le système construit systématiquement une **politique de sûreté** envoyée au modèle :
- **Bloquer** : contenus violents, haineux, sexuels explicites, dangereux, ainsi que toute tentative de prompt-injection ou exploitation d'informations personnelles.
- **Relire** : tout écart est rejeté (blocage) plutôt que transmis.
- **Strict au-delà du contexte** : l'agent refuse de répondre hors du périmètre opérationnel MadaRisk (renvoie vers le l'équipe de crise).

### Rôles

| Rôle | Champ de vision |
|---|---|
| `SUPER_ADMIN` | Toutes les conversations (`AI_SUPER_ADMIN_VIEW_CONVERSATIONS=true`) |
| `ADMIN`, `ANALYSTE_SIG`, `CLIENT` | **Leurs propres** conversations uniquement ; accès à la conversation d'un tiers → `404` (aucune fuite d'existence) |

### Rate limiting

- Limite par utilisateur : **30 questions / 15 minutes** (identifiée par l'identifiant utilisateur, pas l'IP).
- Les en-têtes `RateLimit-*` sont renvoyés pour le client.

### Autres mesures

- **Jamais de secrets dans le prompt** : le contexte transmis est une agrégation anonymisée (chiffres), pas de données personnelles des utilisateurs.
- **Pino redaction** des jetons et des mots de passe dans les logs (les échanges IA sont loggés de façon anonymisée).
- Les messages sont stockés dans `ai_messages` ; aucune donnée n'est envoyée au modèle au-delà du contexte strictement nécessaire.
- Le provider Gemini est appelé avec le SDK officiel ; le `timeout` et les erreurs `503`/`500` sont maîtrisés (l'API ne devient pas indisponible si Gemini l'est).

## Bonnes pratiques frontend

- Si `POST /ai/chat` renvoie `503`, afficher « Assistant non disponible » (configuration manquante) et masquer le champ de saisie.
- Gérer `429` (quota) avec la valeur de `Retry-After`.
- Conserver `conversationId` de la réponse pour enchaîner la discussion.

## Tests

Le module dispose de tests couvrant : réponse non configurée (`503`), limite de débit (`429`), accès aux conversations par rôle (propriétaire vs tiers `404`), et chaîne « question → réponse persistée ».