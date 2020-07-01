---
layout: blogpost_layout.njk
title: Comprendre les différents types de scans de PostgreSQL
description: "Sequential scan, index scan, Bitmap scan, index only scan, vous
saurez tout."
tags: post
date: 2020-04-24
---

<div class="intro">

<code>EXPLAIN</code> et <code>ANALYZE</code> sont des outils incontournables
pour diagnostiquer les problèmes de performances de certaines requêtes SQL. Il
n'est néanmoins pas toujours évident de comprendre ce qu'ils nous racontent.
Aujourd'hui nous allons nous intéresser à une partie essentielle des
informations fournies par <code>EXPLAIN</code> : les différents types de scans
utilisés par PostgreSQL.

</div>

## Qu'est-ce qu'un scan ?

Dans le langage de PostgreSQL, un <strong>scan</strong> correspond à l'opération
d'aller chercher dans une table les informations nécessaires à une requête.
PostgreSQL dispose de plusieurs façons d'aller chercher ces informations, et
chaque méthode a des implications différentes sur les performances de la
requête. Les scans les plus courants sont le <strong>sequential scan</strong> et
l'<strong>index scan</strong>, mais nous allons également voir les <strong>index
only scans</strong> et les <strong>bitmap scans</strong>.

Pour comprendre les implications de chaque type de scan sur les performances, et
pourquoi le planner de PostgreSQL va choisir une méthode plutôt qu'une autre
pour une requête, nous allons utiliser une analogie.

<figure>
  <img alt="Une photographie aérienne de la Bibliothèque Nationale de France" src="https://cache.20minutes.fr/photos/2015/03/23/this-aerial-picture-taken-639a-diaporama.jpg" />
  <figcaption>La Bibliothèque Nationale de France (BNF)</figcaption>
</figure>

Imaginons un archiviste qui travaille à la BNF, dont le travail consiste à
répondre aux demandes d'ouvrages qui lui sont faites à l'accueil des archives.
Les livres représentent nos données, et ils sont rangés dans de nombreuses
étagères, dans ne nombreuses pièces, dans plusieurs bâtiments.

_Je sais que cette analogie n'est pas exacte : à quoi correspond une table, une
colonne, une page, où est le disque dur, le cache ? Le but n'est pas d'être
exact, mais de donner un sentiment approximatif mais concret du travail du
planner._

Lorsque vous vous présentez au comptoir de l'archiviste, vous pouvez lui
demander des livres répondant à certains critères : je voudrais tous les livres
de Charles Dickens, ou bien tous les livres publiés aux éditions _La Fabrique_
entre 1997 et 2001. Pour répondre à cette demande, l'archiviste va (le plus
souvent) consulter les index dont il dispose à son bureau, puis aller chercher
les ouvrages en question à l'aide de son petit chariot.

Pour essayer de coller à cette analogie, j'ai utilisé un jeu de données de la
marie de Paris pour générer une petite base de donnée qui nous servira à voir
des exemples concrets dans PostgreSQL. C'est
[la liste des livres disponibles dans les bibiolthèques parisiennes](https://opendata.paris.fr/explore/dataset/tous-les-documents-des-bibliotheques-de-pret/information/).

```
# SELECT COUNT(*) FROM books;
 count
--------
 815534
```

La table <code>books</code> contient un <code>id</code>, un titre, un auteur,
une date de publication et une maison d'édition. Par défaut, PostgreSQL nous a
créé un index sur la clé primaire de la table, <code>id</code>.

```
# \d books
              Table "public.books"
 Column |          Type          | Collation | Nullable |              Default
--------+------------------------+-----------+----------+-----------------------------------
 id     | integer                |           | not null | nextval('books_id_seq'::regclass)
 title  | character varying(255) |           |          |
 author | character varying(255) |           |          |
 date   | character varying(255) |           |          |
 editor | character varying(255) |           |          |
Indexes:
    "books_pkey" PRIMARY KEY, btree (id)

```

## Le sequential scan

C'est le type de scan le plus simple, que l'on rencontre sur une table qui ne
contient aucun index. Cherchons dans notre base de donnée toutes les éditions
d'_Oliver Twist_ :

```
# SELECT * FROM books WHERE title = 'Oliver Twist';
   id    |    title     |     author      |     date     | editor
---------+--------------------------------+--------------+-----------+
  822128 | Oliver Twist | Charles Dickens | 2012         | Penguin
  827841 | Oliver Twist | Charles Dickens | cop. 2006    | Black Cat
  831013 | Oliver Twist | Charles Dickens | 1985         | Penguin
  ...
```

Et jetons un œil à ce que fait le planner de PostgreSQL :

<div class="stack">
  <pre><code># EXPLAIN SELECT * FROM books WHERE title = 'Oliver Twist';
                          QUERY PLAN
  --------------------------------------------------------------------
   <strong>Seq Scan</strong> on books  (cost=0.00..20286.18 rows=2 width=67)
     <strong>Filter:</strong> ((title)::text = 'Oliver Twist'::text)</code></pre>

  <div class="text-sm">

_Si jamais vous suivez ces exemple sur votre propre base de données, il est
possible que vous voyiez des workers et des Parallel Seq scans. Je les ai
désactivés pour l'instant afin de simplifier les exemples._

  </div>
</div>

On voit que PostgreSQL fait un <strong>sequential scan</strong> sur la table
<code>books</code>. Cela signifie qu'il parcours toute la table, ligne par
ligne, et qu'à chaque ligne il vérifie si la valeur de la colonne
<code>author</code> est bien <strong>Charles Dickens</strong> (c'est la partie
<code>Filter: (...)</code>). Si oui, il garde cette ligne dans ses résultats, si
non, il passe simplement à la ligne suivante.

Qu'est-ce que ça signifie pour notre archiviste ? Imaginons que vous lui
demandiez tous les livres de Charles Dickens. Le fait de ne pas avoir d'index,
c'est comme si notre archiviste n'avait aucun système de référencement des
livres. Si bien que pour nous trouver les ouvrages que nous cherchons, il serait
obligé de parcourir **toute** la bibliothèque, bâtiment par bâtiment, étage par
étage, pièce après pièce, livre après livre, de le saisir, en regarder l'auteur
et décider s'il doit l'ajouter ou non à son petit chariot.

On comprend donc bien que du point de vue des performances, les sequential scans
ne sont pas idéaux. Pour une petite table ça va. Par exemple si vous devez
trouver un livre dans votre bibliothèque personnelle, ça peut rester
relativement rapide, même si vos livres ne sont pas triés. Par contre, pour une
bibliothèque municipale, ça commence à être compliqué. Et on comprend bien que
plus notre bibliothèque/table est grande, plus un sequential scan sera
pénalisant.

Bien sûr dans la vraie vie toutes les bibliothèques sont dotées de systèmes de
tri et de classement qui permettent de retrouver facilement des livres. Notre
archiviste aura probablement à portée de main différents moyens de retrouver où
est rangé un livre en particulier. Par exemple, il pourrait disposer d'une liste
de tous les livres de la bibliothèque, triée par ordre alphabétique, où à chaque
livre serait associée une référence, qui permettrait de savoir où il est rangé.

{% include './book.njk' %}

Pour pouvoir retrouver facilement un livre à partir de son titre, nous avons
créé une liste **ordonnée** des titres de tous les livres de la bibliothèque, et
nous y avons associé une information qui permet de localiser le livre en
question. C'est exactement de cette façon que fonctionne un **index** dans une
base de donnée PostgreSQL, ce qui nous amène à notre deuxième type de scan.

## L'index scan

Ajoutons un index sur la colonne <code>title</code> de notre table.

```
# CREATE INDEX title_index ON books (title);
CREATE INDEX
```

Et réessayons notre requête précédente :

<div>
<pre><code># EXPLAIN SELECT * FROM books WHERE title = 'Oliver Twist';
                        QUERY PLAN
---------------------------------------------------------------------------
 <strong>Index Scan using title_index</strong> on books  (cost=0.42..12.46 rows=2 width=67)
   <strong>Index Cond:</strong> ((title)::text = 'Oliver Twist'::text)</code></pre>
</div>

Cette fois-ci, plutôt que d'aller lire chaque entrée de la table pour voir si
elle correspond à ce que l'on cherche, PostgreSQL va d'abord parcourir notre
index. À chaque fois qu'il trouve une entrée de l'index qui correspond à notre
recherche, il va aller chercher cette entrée dans la table, puis continuer son
parcours de l'index.

Pour notre archiviste, cela signifie qu'il va consulter son index (le livre
présenté plus haut), et qu'à chaque fois qu'il voit un livre correspondant à
notre demande, il va le chercher en utilisant la référence associée.

On voit ici une des limites de notre analogie : pourquoi notre archiviste ne
compile-t-il pas d'abord la liste de toutes les références recherchées, puis va
les récupérer avec son chariot en une seule fois ? Contrairement aux livres
d'une bibliothèque, les entrées dans une table ne sont pas triées. Si l'on doit
récupérer plusieurs livres, rien ne nous dit qu'ils seront proches les uns des
autres, et il y a de fortes chances que l'on se retrouve à visiter plusieurs
bâtiments quoi qu'il arrive. Imaginons également (ce ne sera pas difficile) que
les fonds publics destinés aux bibliothèques municipales aient été drastiquement
dimininués ces 30 dernières années, si bien que notre archiviste doive
économiser au maximum encre et papier, et n'en utiliser que lorsqu'il est
absolument certain que ça en vaudra la peine.

C'est un peu ce qu'il se passe pour PostgreSQL, qui essaie au maxiumum
d'économiser la mémoire vive et le temps de CPU qui seraient nécessaires pour
garder en mémoire et trier les entrées de l'index qui correspondent à notre
requête. Néanmoins, il arrive que le jeu en vaille la chandelle, ce qui nous
amène à notre prochain type de scan.

## Le bitmap scan

Ajoutons un index sur la colonne <code>author</code> de notre table, avant
d'aller chercher tous les livres de Charles Dickens.

```
# CREATE INDEX author_index ON books (author);
CREATE INDEX
```

<div>
<pre><code># EXPLAIN ANALYZE SELECT * FROM books WHERE author = 'Charles Dickens';
                             QUERY PLAN
----------------------------------------------------------------------------------
 <strong>Bitmap Heap Scan</strong> on books  (cost=4.59..85.98 rows=21 width=67)
   Recheck Cond: ((author)::text = 'Charles Dickens'::text)
   ->  <strong>Bitmap Index Scan on author_title_index</strong>  (cost=0.00..4.58 rows=21 width=0)
         Index Cond: ((author)::text = 'Charles Dickens'::text)</code></pre>
</div>

PostgreSQL a décidé de ne pas utiliser un index scan, mais un bitmap scan, qui
se passe en deux parties (la sortie d'<code>EXPLAIN</code> se lit de bas en
haut).

D'abord un <strong>bitmap index scan</strong> : comme précédemment, PostgreSQL
parcours notre index à la recherche des entrées qui correspondent à notre
recherche. À la différence d'un index scan, au lieu d'aller chercher tout de
suite les entrées correspondantes dans la table, il les garde en mémoire.

Ensuite, un <strong>bitmap heap scan</strong> : une fois qu'il a trouvé toutes
les entrées recherchées dans l'index, PostgreSQL va les trier par rapport à leur
**localisation physique sur le disque dur**, puis aller les chercher dans la
table dans cet ordre. Le but de cette opération est de minimiser la distance
physique à parcourir entre chaque entrée.

Voici ce que cela pourrait donner pour notre archiviste. D'abord, il récupère la
liste de tous les ouvrages de Charles Dickens grâce à son index, puis, sur une
feuille de papier, trie ces ouvrages par référence. De cette manière, il sait
qu'il doit d'abord visiter le bâtiment AL pour récupérer un livre, puis le
bâtiment EN, puis enfin le bâtiment FR, sur trois étages différents (E, L et S),
sachant qu'il devra visiter deux salles différentes à l'étage L (033 et 839).

{% include './book2.html' %}

PostgreSQL va décider d'utiliser un bitmap scan quand il sait que la requête
risque de retourner un nombre important de résultats. Quel est ce nombre, et
comment PostgreSQL peut le savoir avant d'exécuter la requête est un peu hors
sujet pour cet article, mais un bon début de réponse se trouve dans
[cet email](https://www.postgresql.org/message-id/12553.1135634231@sss.pgh.pa.us)
de Tom Lane, qui a implémenté les bitmap scans dans PostgreSQL (vous y
découvrirez également pourquoi on appelle ça un bitmap scan).

## Index only scans

SQL a une fonctionalité intéressante : il permet de créer un index
<b>multi-colonne</b>. Comme son nom l'indique, ce type d'index permet de
récupérer des lignes en utilisant des critères de sélection sur plusieurs
colonnes.

```
# CREATE INDEX composite_index ON books (title, author);
CREATE INDEX
```

Cette index pourra être utilisé lorsqu'on cherche les livres par titre et par
auteur.

<div class="stack">
<pre><code>EXPLAIN SELECT * FROM books WHERE author = 'Charles Dickens' AND
title = 'Oliver Twist';
                           QUERY PLAN
-------------------------------------------------------------------------------------------------------
 Index Scan using composite_index on books  (cost=0.42..8.45 rows=1 width=67)
   Index Cond: (((title)::text = 'Oliver Twist'::text) AND ((author)::text =
'Charles Dickens'::text))</code></pre>
</div>

L'index de notre archiviste pourra ressembler à ça :

{% include './book3.html' %}

Une propriété intéressante de cet index est que si l'on demande à notre
archiviste qui est l'auteur d'un livre, il n'aura pas besoin d'aller chercher
physiquement ce livre pour avoir la réponse. Il lui suffit de chercher la ligne
de son index correspondant au titre demandé, et de regarder directement l'auteur
associé.

PostreSQL permet exactement la même optimisation grâce aux <b>Index-only
Scans</b> :

<div>
<pre><code># EXPLAIN SELECT title, author FROM books WHERE title = 'Oliver
Twist';
                          QUERY PLAN
-----------------------------------------------------------------------------------
 Index Only Scan using composite_index on books  (cost=0.42..4.46 rows=2
width=43)
   Index Cond: (title = 'Oliver Twist'::text)</code></pre>
</div>

Nous voyons bien que PostgreSQL n'a pas eu besoin de consulter les lignes
corrspondantes dans la table <code>books</code>, il s'est contenté de consulter
l'index. Cette fonctionnalité peut s'avérer salutaire lorsqu'on requête des
tables à très grosse volumétrie, où le moindre accès à la table peut devenir
trop long à cause des lectures sur le disque dur.

## Conclusion

Voici en résumé les 4 types de scans que peut effectuer PostgreSQL :

- **Sequential Scan** : parcours de toutes les lignes de la table.

  _Sera utilisé lorsque la table contient assez peu d'entrée pour qu'un parcours
  complet soit plus rapide que l'utilisation d'un index._

- **Index Scan** : parcours de l'index, puis accès aux lignes de la table
  correspondant à la requête.

  _Sera utilisé lorsque la table est trop volumineuse pour se contenter d'un
  sequential scan._

- **Bitmap Scan** : parcours de l'index, puis tri des résultats en mémoire par
  rapport à leur localisation physique sur le disque dur, puis accès aux lignes
  de la table.

  _Sera utilisé lorsque le nombre de lignes retourné par la requête est grand et
  justifie que l'on prenne le temps de trier les entrées par localisation
  physique afin de minimiser le temps d'accès aux lignes de la table._

- **Index-Only Scan** : parcours de l'index, puis renvoi des données déjà
  présentes dans l'index.

  _Sera utilisé lorsque l'index contient toutes les données demandées dans la
  requête_
