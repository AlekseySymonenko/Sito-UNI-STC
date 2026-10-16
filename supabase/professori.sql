-- Elenco docenti (fonte: informazioni_professori, aggiornato aprile 2026).
-- COME USARLO: Supabase → SQL Editor → incolla tutto → Run. Inserisce i docenti solo se l'elenco è vuoto.
insert into public.professors (last_name, first_name, email, department, research_group, research_area, positions, courses, education)
select * from (values
  ('Abbotto', 'Alessandro', 'alessandro.abbotto@unimib.it', 'Scienza dei materiali', 'Abbotto, Bettucci, Manfredi', 'Sintesi e applicazioni di materiali organici per l''energia', 'Professore ordinario', 'Chimica organica 2
Composti organici per l''energia
Organica 1 (sc dei materiali)
Chimica (sc della formazione)', 'Chimica'),
  ('Airoldi', 'Cristina', 'cristina.airoldi@unimib.it', 'Biotecnologie e bioscienze', 'BiorgNMR: Airoldi, Palmioli', 'Studi con NMR', 'Professore associato', 'Organica per le scienze della vita
Organica (sc. biologiche)
Analisi di biomolecole (biotech)', 'Biotecnologie, Chimica'),
  ('Ballabio', 'Davide', 'davide.ballabio@unimib.it', 'DISAT', 'QSAR: Ballabio, Consonni, Termopoli', 'Analitica e chemiometria, in particolare rispetto ad applicazioni ambientali e alimentari', 'Professore ordinario', 'Chimica analitica
Chemiometria
Chimica analitica delle formulazioni
Chimica analitica (sc. ambientali)', 'Biotecnologie alimentari'),
  ('Bergamaschini', 'Roberto', 'roberto.bergamaschini@unimib.it', 'Scienza dei materiali', null, 'Modellizzazione informatica di strutture solide', 'Professore associato', 'Fisica 2
Chimica fisica dello stato solido e delle superfici
Computational material science (sc. Dei materiali)', 'Sc. dei materiali'),
  ('Bertini', 'Luca', 'luca.bertini@unimib.it', 'Biotecnologie e bioscienze', null, 'Modellistica di siti attivi biologici', 'Professore associato', 'Chimica bioinorganica
Fotochimica
Chimica fisica dei sistemi biologici (biotech)
Chimica generale (biotech)', 'Chimica'),
  ('Beverina', 'Luca', 'luca.beverina@unimib.it', 'Scienza dei materiali', 'LaSMO: Beverina, Sassi', 'Sviluppo, sintesi e caratterizzazione di specie organiche per applicazioni nella scienza dei materiali', 'Professore ordinario
Pro-Rettore alla Terza Missione e ai Rapporti con le imprese', 'Chimica organica superiore
Sintesi e tecniche speciali organiche dei materiali', 'Sc. dei materiali'),
  ('Binetti', 'Simona Olga', 'simona.binetti@unimib.it', 'Scienza dei materiali', 'MIBSOLAR: Binetti, Trifiletti, Tseberlidis', 'Sviluppo di materiali per pannelli solari', 'Professore ordinario
Presidentessa della scuola di scienze
Direttrice MIBSOLAR', 'Chimica fisica 3
Chimica fisica dello stato solido e delle superfici
Materiali per tecnologie fotovoltaiche (sc. dei materiali)', 'Fisica, Sc. dei materiali'),
  ('Bolzacchini', 'Ezio', 'ezio.bolzacchini@unimib.it', 'DISAT', null, 'Studio di inquinanti nell''ambiente', 'Professore associato', 'Chimica ambientale
Chimica delle acque (sc. ambientali)', 'Scienze biologiche'),
  ('Bonati', 'Laura', 'laura.bonati@unimib.it', 'DISAT', null, 'Modellistica di proteine', 'Professore associato', 'Chimica fisica 2 (fino al 2026)
Chimica fisica ambientale (sc. ambientali) (fino al 2026)', 'Chimica'),
  ('Bracco', 'Silvia', 'silvia.bracco@unimib.it', 'Scienza dei materiali', 'NMRgroup: Bracco, Comotti, Sozzani', 'Sintesi e caratterizzazione di polimeri nanostrutturati', 'Professore associato', 'Elementi di polimeri
Materiali macromolecolari (sc. dei materiali)
Sintesi di macromolecole (sc. dei materiali)', 'Chimica, Sc. dei materiali'),
  ('Cadamuro', 'Francesca', 'francesca.cadamuro@unimib.it', 'Medicina e chirurgia', 'Glycobiomaterial: Cadamuro, Nicotra, Russo', 'Sviluppo di biomateriali per applicazioni mediche', 'Ricercatore a tempo determinato', 'Chimica organica dei materiali (sc. dei materiali)', 'Chimica'),
  ('Cipolla', 'Laura Francesca', 'laura.cipolla@unimib.it', 'Biotecnologie e bioscienze', null, 'Sintesi e caratterizzazione di carboidrati funzionalizzati per varie applicazioni', 'Professore associato', 'Chimica organica applicata alle
Biotecnologie
Chimica organica (sc. biologiche)', 'Chimica'),
  ('Collina', 'Elena Maria', 'elena.collina@unimib.it', 'DISAT', 'LCAS: Collina, Lasagni, Saliu', 'Studio degli inquinanti e del loro smaltimento', 'Professore associato', 'Fondamenti chimici della sostenibilità
Processi e impianti di trattamento e bonifica
LCA e indicatori di sostenibilità (sc. ambientali)', 'Chimica'),
  ('Comotti', 'Angiolina', 'angiolina.comotti@unimib.it', 'Scienza dei materiali', 'NMRgroup: Bracco, Comotti, Sozzani', 'Sintesi e caratterizzazione di polimeri nanostrutturati', 'Professore ordinario', 'Chimica dei materiali macromolecolari (sc. dei materiali)
Lab di caratterizzazione strumentale (sc. dei materiali)
Nanochemistry, nanoporous materials
And nanomedicine (sc. dei materiali)', 'Chimica'),
  ('Consonni', 'Viviana', 'viviana.consonni@unimib.it', 'DISAT', 'QSAR: Ballabio, Consonni, Termopoli', 'Chemiometria e analitica teorica', 'Ricercatore a tempo indeterminato', 'Chimica analitica
Chimica analitica (sc. ambientali)', 'Scienze ambientali, Chimica'),
  ('Cosentino', 'Ugo Renato', 'ugo.cosentino@unimib.it', 'DISAT', 'Molecular Modeling: Cosentino, Greco', 'Modellistica molecolare', 'Professore associato', 'Chimica fisica 1
Modellistica molecolare
Chimica fisica ambientale (sc. ambientali)
Didattica della chimica (sc. ambientali)', 'Chimica'),
  ('d''Arienzo', 'Massimiliano', 'massimiliano.darienzo@unimib.it', 'Scienza dei materiali', 'NanomatLab: d''Arienzo, di Credico, Nisticò, Scotti', 'Sviluppo di materiali inorganici per varie applicazioni', 'Professore associato', 'Chimica inorganica per le formulazioni
Chimica generale (sc. dei materiali)', 'Chimica'),
  ('De Gioia', 'Luca', 'luca.degioia@unimib.it', 'Biotecnologie e bioscienze', null, 'Studio delle catalisi bio inorganiche', 'Professore ordinario', 'Stutture e interazioni molecolari
Didattica della chimica (sc. ambientali)
Chimica generale (bioscienze)', 'Chimica'),
  ('Di Credico', 'Barbara', 'barbara.dicredico@unimib.it', 'Scienza dei materiali', 'NanomatLab: d''Arienzo, di Credico, Nisticò, Scotti', 'Sintesi di elastomeri e altre strutture polimeriche o inorganiche', 'Professore associato', 'Chimica generale
Chimica inorganica 1
Sintesi inorganica (sc. dei materiali)', 'Chimica'),
  ('Di Liberto', 'Giovanni', 'giovanni.diliberto@unimib.it', 'Scienza dei materiali', 'QCLAB: di Liberto, Giordano, Pacchioni', 'Studio computazionale di materiali solidi per la fotocatalisi', 'Ricercatore a tempo determinato', 'Chimica generale
Chimica (fisica)
Chimica dei materiali ceramici (sc. dei materiali)', 'Chimica'),
  ('Di Valentin', 'Cristiana', 'cristiana.divalentin@unimib.it', 'Scienza dei materiali', 'NanoQLab: di Valentin, Perilli', 'Sintesi e applicazioni di nanomateriali, soprattutto in ambito medico', 'Professore ordinario
Direttrice NANOQLAB', 'Chimica generale (fino al 2026)
Chimica inorganica 2 (dal 2027)
Tecniche e metodi per le spettroscopie
Chimica generale (physical sciences for innovative technologies)
Nanochimica (sc. dei materiali)', 'Chimica'),
  ('Fasoli', 'Mauro', 'fasoli.mauro@unimib.it', 'Scienza dei materiali', 'X', 'Proprietà luminose ed elettroniche dei materiali', 'Professore associato', 'Fisica 1
Applicazioni di materiali per detector di radiazioni ionizzanti (sc. dei materiali)', 'Fisica, Sc. dei materiali'),
  ('Ferrara', 'Chiara', 'chiara.ferrara@unimib.it', 'Scienza dei materiali', 'Ferrara, Ruffo', 'Sintesi e caratterizzazione di materiali solidi per celle elettrochimiche', 'Professore associato', 'Chimica fisica 3
Chimica fisica dei materiali (sc. dei materiali)
Chimica fisica dello stato solido (sc. dei materiali)', 'Chimica'),
  ('Ferrero', 'Luca', 'luca.ferrero@unimib.it', 'DISAT', null, 'Determinazione analitiche di inquinanti ambientali, soprattutto in atmosfera', 'Professore associato', 'Chimica dell''atmosfera (sc. ambientali)
Chimica generale (sc. ambientali)
Chimica dell''ambiente marino (sc. marine)', 'Scienze ambientali'),
  ('Giordano', 'Livia', 'livia.giordano@unimib.it', 'Scienza dei materiali', 'QCLAB: di Liberto, Giordano, Pacchioni', 'Sviluppo di elettroliti', 'Professore associato', 'Catalisi per ambiente ed energia
Chimica dei materiali ceramici (sc. dei materiali)
Chimica (fisica)', 'Fisica, Sc. dei materiali'),
  ('Gosetti', 'Fabio', 'fabio.gosetti@unimib.it', 'DISAT', null, 'Determinazioni analitiche di cibo, farmaci e droghe', 'Professore associato', 'Chimica analitica strumentale', 'Chimica'),
  ('Greco', 'Claudio', 'claudio.greco@unimib.it', 'DISAT', 'Molecular Modeling: Cosentino, Greco', 'Modellistica molecolare', 'Professore ordinario
Direttore DISAT', 'Chimica fisica 2
Chimica fisica superiore
Fotochimica', 'Biotecnologie, Chimica'),
  ('La Ferla', 'Barbara', 'barbara.laferla@unimib.it', 'DISAT', 'VaLicel Lab: La Ferla, Lange, Orlandi, Zoia', 'Sintesi e caratterizzazione di composti organici, in particolare specie glicofunzionalizzate', 'Professore associato', 'Chimica organica 3
Chimica organica 1 (biotech)
Composti organici di interesse
Merceologico (biotech)', 'Chimica'),
  ('Lange', 'Heiko', 'heiko.lange@unimib.it', 'DISAT', 'VaLicel Lab: La Ferla, Lange, Orlandi, Zoia', 'Sintesi e caratterizzazione organica, principalmente di farmaci, a partire da materia vegetale', 'Professore associato', 'Processi a basso impatto ambientale
Chimica generale (sc. geologiche)
Principi della chimica sostenibile (sc. ambientali)
Risorse non rinnovabili (economics and technologies for sustainability)', 'Chimica'),
  ('Lasagni', 'Marina', 'marina.lasagni@unimib.it', 'DISAT', 'LCAS: Collina, Lasagni, Saliu', 'Studio della reattività di inquinanti atmosferici', 'Professore associato', 'Chimica ambientale
Analisi chimiche ambientali (sc. ambientali)', 'Chimica'),
  ('Legnani', 'Laura', 'laura.legnani@unimib.it', 'Biotecnologie e bioscienze', null, 'Modellistica di molecole bioattive', 'Professore associato', 'Chimica supramolecolare
Laboratorio di chimica (biotech)', 'Chimica'),
  ('Magli', 'Francesca', 'francesca.magli@unimib.it', 'Economia', 'X', 'X', 'Professore ordinario', 'Chimcia farmaceutica', 'Business administration'),
  ('Manfredi', 'Norberto', 'norberto.manfredi@unimib.it', 'Scienza dei materiali', 'Abbotto, Bettucci, Manfredi', 'Sintesi e caratterizzazione di materiali organici per l''energetica sostenibile e altre applicazioni', 'Professore associato', 'Chimica dei materiali molecolari
Chimica organica per l''energetica
Sostenibile
Organica 1 (sc. dei materiali)
Chimica dei materiali molecolari (sc. dei materiali)
Materiali per tecnologie fotovoltaiche (sc. dei materiali)', 'Sc. dei materiali'),
  ('Mapelli', 'Valeira Maria Teresa', 'valeria.mapelli@unimib.it', 'Biotecnologie e bioscienze', null, 'Biotech industriali', 'Professore associato', 'Biotecnologie industriali
Fermentazioni e bioprocessi (biotech)
Biologia sintetica per le biotecnologie (biotech)', 'Biotecnologie'),
  ('Mattiello', 'Sara', 'sara.mattiello@unimib.it', 'Scienza dei materiali', null, 'Sintesi e caratterizzazione di composti organici e polimerici per varie applicazioni', 'Ricercatore a tempo determinato', 'Chimica delle formulazioni organiche e polimeriche
Chimica organica dei materiali (sc. dei materiali)
Chimica organica (ottica)', 'Sc. dei materiali'),
  ('Moret', 'Massimo', 'massimo.moret@unimib.it', 'Scienza dei materiali', null, 'Sintesi e caratterizzazione raggi X di strutture cristalline', 'Professore associato', 'Chimica generale
Chimica inorganica 2 (fino al 2026)
Chimica dei materiali inorganici (fino al 2026) (sc. dei materiali)', 'Chimica'),
  ('Mustarelli', 'Piercarlo', 'piercarlo.mustarelli@unimib.it', 'Scienza dei materiali', null, 'Sviluppo di batterie', 'Professore ordinario
Direttore dipartimento di scienza dei materiali', 'Chimica fisica applicata
Chimica fisica dei sistemi complessi', 'Fisica, Chimica fisica'),
  ('Narducci', 'Dario', 'dario.narducci@unimib.it', 'Scienza dei materiali', 'ThELAB: Narducci', 'Sintesi e caratterizzazione di materiali termoelettrici', 'Professore associato', 'Chimica fisica superiore
Termodinamica di non equilibrio
Termodinamica (sc. dei materiali)', 'Chimica'),
  ('Nisticò', 'Roberto', 'roberto.nistico@unimib.it', 'Scienza dei materiali', 'NanomatLab: d''Arienzo, di Credico, Nisticò, Scotti', 'Sintesi e caratterizzazione di strutture inorganiche per applicazioni ambientali', 'Professore associato', 'Chimica inorganica 1
Chimica di coordinazione e metallorganica
Operazioni elementari di laboratorio (sc. dei materiali)', 'Chimica industriale'),
  ('Nocente', 'Massimo', 'massimo.nocente@unimib.it', 'Fisica', 'X', 'Studio di plasmi nei reattori a fusione nucleare', 'Professore associato', 'Fisica 2
Fisica dei plasmi (fisica)
Fisica dei plasmi 2 (fisica)', 'Fisica'),
  ('Noja', 'Diego Davide Raffaele', 'diego.noja@unimib.it', 'Matematica', 'X', 'Per noi chimici è incomprensibile', 'Professore ordinario', 'Matematica 2 (fino al 2026)
Meccanica classica (matematica)', 'Fisica, Matematica'),
  ('Orlandi', 'Marco Emilio', 'marco.emilio@unimib.it', 'DISAT', 'VaLicel Lab: La Ferla, Lange, Orlandi, Zoia', 'Analitica applicata a green chemistry e biorefinery', 'Professore ordinario
Rettore', 'Chimica analitica strumentale (fino al 2025)
Chimica analitica (sc. ambientali)', 'Chimica'),
  ('Pacchioni', 'Gianfranco', 'pacchioni.gianfranco@unimib.it', 'Scienza dei materiali', 'QCLAB: di Liberto, Giordano, Pacchioni', 'Chimica computazionale dello stato solido, in particolare per applicazioni solari', 'Professore ordinario', 'Chimica inorganica 2 (fino al 2026)
Chimica dei materiali ceramici (sc. dei materiali)', 'Chimica'),
  ('Palmioli', 'Alessandro', 'alessandro.palmioli@unimib.it', 'Biotecnologie e bioscienze', 'BiorgNMR: Airoldi, Palmioli', 'Studio e caratterizzazione di matrici complesse di origine biologica', 'Professore associato', 'Chimica organica (sc. biologiche)
Isoloamento e purificazione di prodotti
Biotecnologici (biotech)', 'Biotecnologie, Chimica'),
  ('Parenti', 'Paolo', 'paolo.parenti@unimib.it', 'DISAT', null, 'Studio di cinetica enzimatica mediante tracciamento', 'Professore associato', 'Elementi di biochimica
Biochimica (sc. ambientali)', 'Biologia'),
  ('Peri', 'Francesco', 'francesco.peri@unimib.it', 'Biotecnologie e bioscienze', 'ThePeriLab: Peri', 'Chimica farmaceutica', 'Professore ordinario
Delegato del Rettore per lo Sviluppo dei Rapporti con la Fondazione University for Innovation', 'Chimica organica 1
Chimica supramolecolare
Medicinal chemistry', 'Chimica'),
  ('Perilli', 'Daniele', 'daniele.perilli@unimib.it', 'Scienza dei materiali', 'NanoQLab: di Valentin, Perilli', 'Chimica computazionale di materiali solidi bidimensionali', 'Ricercatore a tempo determinato', 'Teoria e metodi per le spettroscopie', 'Chimica, Sc. dei materiali'),
  ('Pigola', 'Stefano', 'stefano.pigola@unimib.it', 'Matematica', 'X', 'Geometria riemanniana', 'Professore associato', 'Matematica 1
Geometria 1 (matematica)
Geometria riemanniana (matematica)', 'Matematica'),
  ('Ruffo', 'Riccardo', 'riccardo.ruffo@unimib.it', 'Scienza dei materiali', 'Ferrara, Ruffo', 'Sintesi di materiali per applicazioni elettrochimiche', 'Professore ordinario', 'Termodinamica e cinetica dei materiali
Chimica fisica dei materiali (sc. dei materiali)
Fondamenti di elettrochimica (sc. dei materiali)', 'Chimica, Sc. dei materiali'),
  ('Russo', 'Laura', 'laura.russo@unimib.it', 'Medicina e chirurgia', 'Glycobiomaterial: Cadamuro, Nicotra, Russo', 'Sviluppo di biomateriali per applicazioni mediche', 'Professore associato', 'Chimcia organica 2
Chimica organica 3
Chimica per le nanotecnologie
Biomediche
Applicazioni mediche della stampa 3D (medicina)', 'Biotecnologie'),
  ('Saliu', 'Francesco', 'francesco.saliu@unimib.it', 'DISAT', 'LCAS: Collina, Lasagni, Saliu', 'Sviluppo di metodi analitici per problemi di chimica ambientale', 'Assistant professor', 'Strumenti e metodi per la sostenibilità (sc. ambientali)', 'Scienze ambientali, Chimica'),
  ('Santoro', 'Carlo', 'carlo.santoro@unimib.it', 'Scienza dei materiali', 'EBLab: Santoro', 'Sviluppo di metodi per applicazioni industriali ambientalmente sostenibili', 'Professore associato', 'Fondamenti di tecnologie chimiche
Industriali
Energia elettrochimica (sc. dei materiali)', 'Ingegneria ambientale'),
  ('Sassi', 'Mauro', 'mauro.sassi@unimib.it', 'Scienza dei materiali', 'LaSMO: Beverina, Sassi', 'Sintesi e caratterizzazione di materiali organici', 'Professore associato', 'Chimica organica 2
Chimica organica 3
Strategie di sintesi organica (sc. dei materiali)
Polimeri (sc. dei materiali)', 'Sc. dei materiali'),
  ('Scotti', 'Roberto', 'roberto.scotti@unimib.it', 'Scienza dei materiali', 'NanomatLab: d''Arienzo, di Credico, Nisticò, Scotti', 'Sintesi inorganica per varie applicazioni', 'Professore associato
Presidente del corso di laurea', 'Chimica inorganica 1
Complementi di chimica inorganica (sc. dei materiali)', 'Chimica industriale'),
  ('Serra', 'Immacolata', 'immacolata.serra@unimib.it', 'Biotecnologie e bioscienze', null, 'Biotecnologie delle fermentazioni', 'Ricercatore a tempo determinato', 'Biotecnologie industriali', 'Biotecnologia'),
  ('Simonutti', 'Roberto', 'roberto.simonutti@unimib.it', 'Scienza dei materiali', 'POSYLIFE: Simonutti', 'Sintesi e caratterizzazione di polimeri nanostrutturati', 'Professore ordinario', 'Sintesi avanzate di polimeri
Chimica delle formulazioni organiche e polimeriche
Proprietà ed applicazione dei materiali
Polimerici (sc. dei materiali)
Polimeri funzionali avanzati (sc. dei materiali)', 'Chimica, Chimica industriale'),
  ('Sozzani', 'Piero Ernesto', 'piero.sozzani@unimib.it', 'Scienza dei materiali', 'NMRgroup: Bracco, Comotti, Sozzani', 'Sintesi e caratterizzazione di polimeri e altre strutture solide', 'Professore associato', 'Chimica macromolecolare', 'Chimica'),
  ('Termopoli', 'Veronica', 'veronica.termopoli@unimib.it', 'DISAT', 'QSAR: Ballabio, Consonni, Termopoli', 'Determinazioni analitiche, in particolare di farmaci e droghe', 'Professore associato', 'Chimica analitica strumentale
Chimica analitica (sc. ambientali)', 'Scienze ambientali, Chimica'),
  ('Tosoni', 'Sergio', 'sergio.tosoni@unimib.it', 'Scienza dei materiali', null, 'Chimica computazionale di superfici dei materiali solidi', 'Professore associato', 'Chimica dei materiali inorganici
Chimica inorganica (ottica)
Chimica generale (sc. ambientali)', 'Chimica'),
  ('Trifiletti', 'Vanira', 'vanira.trifiletti@unimib.it', 'Scienza dei materiali', 'MIBSOLAR: Binetti, Trifiletti, Tseberlidis', 'Sintesi e caratterizzazione di perovskiti per applicazioni fotovoltaiche', 'Ricercatore a tempo determinato', 'Chimica fisica 2
Chimica fisica 3', 'Sc. dei materiali'),
  ('Tseberlidis', 'Giorgio', 'giorgio.tseberlidis@unimib.it', 'Scienza dei materiali', 'MIBSOLAR: Binetti, Trifiletti, Tseberlidis', 'Sintesi e caratterizzazione di materiali solidi per applicazioni fotovoltaiche', 'Ricercatore a tempo determinato', 'Chimica fisica 3', 'Chimica'),
  ('Zoia', 'Luca', 'luca.zoia@unimib.it', 'DISAT', 'VaLicel Lab: La Ferla, Lange, Orlandi, Zoia', 'Sintesi e caratterizzazione organica a partire da materia vegetale', 'Professore associato', 'Chimica organica 2
Chimica organica (sc. ambientali)
Processi a basso impatto ambientale (sc. ambientali)', 'Scienze ambientali')
) as v(last_name, first_name, email, department, research_group, research_area, positions, courses, education)
where not exists (select 1 from public.professors);
