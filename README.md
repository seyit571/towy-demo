# TOWY — Plateforme unifiée (prototype gratuit)

Un seul site public, un seul moteur de missions, cinq vues : accueil, particulier, garage, prestataire et contrôle.

Site : https://seyit571.github.io/towy-demo/

## Fonctions disponibles en démonstration

- Particuliers : dépannage, remorquage, transport planifié, estimation illustrative et suivi.
- Garages : récupération, transferts, livraisons, remorquage, transport planifié.
- Prestataires : disponibilité et compatibilité, acceptation des missions locales, devis transport, prise en charge, clôture.
- TOWY Control : registre unique, affectation de démonstration, suivi des missions, métriques illustratives.
- Les anciennes adresses business.html, depannage.html, transport.html renvoient désormais vers la plateforme unique.

Le front-end est dans index.html, app.css et app.js.

## Vérifier les parcours gratuitement

1. Créer une demande Particuliers > Dépannage, l'accepter depuis Dépanneurs, confirmer l'enlèvement puis terminer.
2. Créer une mission Garages & pros, l'attribuer depuis TOWY Control.
3. Créer un Transport depuis Particuliers. Depuis Dépanneurs, proposer un tarif. Dans Particuliers, choisir le devis. Depuis Dépanneurs, simuler l'enlèvement et la livraison.
4. Réinitialiser les missions de test dans TOWY Control si nécessaire.

## Tests automatiques

GitHub Actions exécute à chaque modification :
- Vérification de syntaxe de app.js avec Node 22.
- Vérification des références HTML et des scénarios via tests/smoke.cjs.

## Limitations importantes

- Prototype GitHub Pages, sans compte utilisateur ni authentification.
- Données uniquement dans le navigateur via localStorage, non partagées avec d'autres utilisateurs.
- Aucun vrai prestataire contacté, aucun GPS, aucun devis commercial, aucun paiement, aucune notification.
- Partenaires, missions initiales et tarifs illustratifs entièrement fictifs.
- Aucun dépannage libre sur autoroute : les interventions y sont réglementées.
- Avant commercialisation : cadrage légal des activités, assurances, autorisations, RGPD, vrais prestataires et backend sécurisé.

Pas d'abonnement ou de serveur payant pour ce pilote de démonstration.
