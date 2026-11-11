// Built-in questions, used when the AI questioner is unavailable.
// Each row: [question, correct answer, wrong, wrong, wrong, fun fact].
// Tiers: little = ages up to 8, mid = 9 to 12, teen = 13 and up.
(function (root) {
  'use strict';

  const TOPICS = {
    science: {
      keys: ['science', 'chemistry', 'physics', 'biology', 'lab', 'experiment', 'nature'],
      little: [
        ['What do plants soak up from the soil through their roots?', 'Water', 'Juice', 'Milk', 'Soda', 'Roots drink up water and carry it to the leaves.'],
        ['Which of these is a liquid at room temperature?', 'Water', 'Rock', 'Wood', 'Brick', 'Water can also be solid ice or a gas called steam.'],
        ['What is frozen water called?', 'Ice', 'Steam', 'Fog', 'Mud', 'Water freezes into ice when it gets colder than 0°C (32°F).'],
        ['Which part of your body do you use to hear sounds?', 'Ears', 'Eyes', 'Nose', 'Toes', 'Sound makes tiny parts inside your ears wiggle, and your brain turns that into what you hear.'],
        ['What gives us light and warmth during the day?', 'The Sun', 'The Moon', 'A cloud', 'The wind', 'The Sun is a giant ball of hot, glowing gas.'],
      ],
      mid: [
        ['What gas do people need to breathe to stay alive?', 'Oxygen', 'Carbon dioxide', 'Helium', 'Hydrogen', 'Plants make the oxygen we breathe.'],
        ['What force pulls things down toward the ground?', 'Gravity', 'Magnetism', 'Friction', 'Wind', 'Gravity is why you land back on the ground after a jump.'],
        ['What is the center of an atom called?', 'Nucleus', 'Membrane', 'Orbit', 'Molecule', 'The nucleus holds protons and neutrons.'],
        ['Which part of a plant makes food from sunlight?', 'Leaves', 'Roots', 'Seeds', 'Bark', 'Leaves use sunlight, water and air to make sugar. This is called photosynthesis.'],
        ['What do we call a material that lets electricity flow through it easily?', 'A conductor', 'An insulator', 'A magnet', 'A fossil', 'Copper wire is a great conductor, and rubber is an insulator.'],
      ],
      teen: [
        ['What is the chemical symbol for gold?', 'Au', 'Ag', 'Gd', 'Go', "Au comes from 'aurum', the Latin word for gold."],
        ['Which structure is known as the powerhouse of the cell?', 'Mitochondria', 'Nucleus', 'Ribosome', 'Golgi apparatus', 'Mitochondria turn nutrients into energy the cell can use.'],
        ['About how fast does light travel in a vacuum?', '300,000 km per second', '30,000 km per second', '3,000,000 km per second', '300 km per second', 'That is fast enough to circle the Earth about seven times in one second.'],
        ["Which gas makes up most of Earth's atmosphere?", 'Nitrogen', 'Oxygen', 'Carbon dioxide', 'Argon', 'About 78% of the air is nitrogen and about 21% is oxygen.'],
        ['Which particle carries a negative electric charge?', 'Electron', 'Proton', 'Neutron', 'Photon', 'Electrons zip around the nucleus, and flowing electrons are what we call electricity.'],
      ],
    },
    animals: {
      keys: ['animal', 'pet', 'zoo', 'wildlife', 'bird', 'dog', 'cat', 'dinosaur', 'ocean', 'insect', 'bug'],
      little: [
        ['What sound does a cow make?', 'Moo', 'Quack', 'Meow', 'Woof', 'Cows say moo, ducks say quack, cats say meow and dogs say woof.'],
        ['Which animal has a very, very long neck?', 'Giraffe', 'Elephant', 'Lion', 'Zebra', "A giraffe's neck can be about 2 meters (6 feet) long."],
        ['What do baby frogs start out as?', 'Tadpoles', 'Caterpillars', 'Chicks', 'Puppies', 'Tadpoles grow legs and lose their tails to become frogs.'],
        ['Which big cat has a fluffy mane?', 'Lion', 'Tiger', 'Leopard', 'Cheetah', 'Only male lions grow a mane.'],
        ['What do bees make that we can eat?', 'Honey', 'Milk', 'Butter', 'Jam', 'Bees turn flower nectar into honey.'],
      ],
      mid: [
        ['What is the biggest animal on Earth?', 'Blue whale', 'African elephant', 'Giraffe', 'Great white shark', 'Blue whales can grow longer than 25 meters (80 feet).'],
        ['What do we call an animal that eats only plants?', 'Herbivore', 'Carnivore', 'Omnivore', 'Predator', 'Cows, rabbits and elephants are all herbivores.'],
        ['How many legs does a spider have?', 'Eight', 'Six', 'Ten', 'Four', 'Insects have six legs. Spiders are arachnids and have eight.'],
        ['Which bird is the fastest runner but cannot fly?', 'Ostrich', 'Penguin', 'Kiwi', 'Parrot', 'Ostriches can sprint at around 70 km/h (43 mph).'],
        ['What is a group of lions called?', 'A pride', 'A pack', 'A herd', 'A flock', 'A pride can include several females, their cubs and a few males.'],
      ],
      teen: [
        ['Which is the only mammal that can truly fly?', 'Bat', 'Flying squirrel', 'Sugar glider', 'Colugo', 'Flying squirrels only glide. Bats flap their wings to fly.'],
        ['How many hearts does an octopus have?', 'Three', 'One', 'Two', 'Eight', 'Two hearts pump blood through the gills and one pumps it around the body.'],
        ['What word describes animals that are mostly active at night?', 'Nocturnal', 'Diurnal', 'Migratory', 'Aquatic', 'Owls, bats and hedgehogs are nocturnal.'],
        ['Which is the largest living species of big cat?', 'Tiger', 'Lion', 'Jaguar', 'Leopard', 'Siberian tigers can weigh over 300 kg (660 lb).'],
        ['Snakes and lizards belong to which animal group?', 'Reptiles', 'Amphibians', 'Mammals', 'Birds', 'Reptiles have scaly skin and are cold-blooded.'],
      ],
    },
    space: {
      keys: ['space', 'astronomy', 'planet', 'star', 'rocket', 'galaxy', 'nasa', 'moon', 'solar'],
      little: [
        ['What is the name of the planet we live on?', 'Earth', 'Mars', 'Venus', 'Jupiter', 'Earth is the third planet from the Sun.'],
        ['Which star is closest to Earth?', 'The Sun', 'Polaris', 'Sirius', 'Betelgeuse', 'The Sun looks so big and bright because it is so close.'],
        ['What shines in the night sky and seems to change shape?', 'The Moon', 'The Sun', 'A comet', 'A rainbow', 'The Moon does not really change. We just see different parts of it lit up.'],
        ['What do we call people who travel to space?', 'Astronauts', 'Sailors', 'Chefs', 'Farmers', 'Astronauts train for years before they fly in a rocket.'],
        ['Which planet is famous for its big, beautiful rings?', 'Saturn', 'Mars', 'Mercury', 'Earth', "Saturn's rings are made of chunks of ice and rock."],
      ],
      mid: [
        ['Which planet is called the Red Planet?', 'Mars', 'Venus', 'Jupiter', 'Mercury', 'Mars looks red because its soil has lots of rusty iron in it.'],
        ['What is the name of our galaxy?', 'The Milky Way', 'Andromeda', 'The Whirlpool', 'The Sombrero', 'Our Solar System is one small part of the Milky Way.'],
        ['Which planet is the biggest in our solar system?', 'Jupiter', 'Saturn', 'Neptune', 'Earth', 'More than 1,000 Earths could fit inside Jupiter.'],
        ['Who was the first person to walk on the Moon?', 'Neil Armstrong', 'Buzz Aldrin', 'Yuri Gagarin', 'John Glenn', 'Neil Armstrong stepped onto the Moon on July 20, 1969.'],
        ['How many planets orbit our Sun?', 'Eight', 'Nine', 'Seven', 'Ten', 'Pluto used to be counted, but it is now called a dwarf planet.'],
      ],
      teen: [
        ['What is the boundary around a black hole called, beyond which nothing can escape?', 'Event horizon', 'Singularity', 'Photosphere', 'Accretion disk', 'Not even light can get out once it crosses the event horizon.'],
        ['Which planet has the shortest year?', 'Mercury', 'Venus', 'Mars', 'Earth', 'Mercury circles the Sun in about 88 Earth days.'],
        ['About how long does sunlight take to reach Earth?', 'About 8 minutes', 'About 8 seconds', 'About 8 hours', 'About 8 days', 'We always see the Sun as it was about 8 minutes ago.'],
        ['Which moon of Jupiter is the largest in the solar system?', 'Ganymede', 'Europa', 'Io', 'Callisto', 'Ganymede is even bigger than the planet Mercury.'],
        ['What kind of star is our Sun?', 'A yellow dwarf', 'A red giant', 'A white dwarf', 'A neutron star', 'Yellow dwarfs shine steadily for about 10 billion years.'],
      ],
    },
    geography: {
      keys: ['geograph', 'country', 'countries', 'capital', 'map', 'world', 'continent', 'flag', 'travel'],
      little: [
        ['What do we call a huge area of salty water?', 'An ocean', 'A pond', 'A puddle', 'A river', 'Oceans cover most of our planet.'],
        ['Which flag has a red maple leaf on it?', 'Canada', 'Mexico', 'Brazil', 'Italy', "Canada's flag is red and white with a maple leaf in the middle."],
        ['Which continent is covered in ice and has penguins?', 'Antarctica', 'Africa', 'Australia', 'Europe', 'Antarctica is the coldest place on Earth.'],
        ['What do we call a very tall, pointy piece of land that can have snow on top?', 'A mountain', 'A valley', 'A lake', 'A beach', 'The tallest mountain on Earth is Mount Everest.'],
        ['Which direction is the opposite of north?', 'South', 'East', 'West', 'Up', 'A compass needle points north, and south is the other way.'],
      ],
      mid: [
        ['What is the capital city of France?', 'Paris', 'Lyon', 'Rome', 'Madrid', 'The Eiffel Tower is in Paris.'],
        ['Which is the largest ocean on Earth?', 'The Pacific Ocean', 'The Atlantic Ocean', 'The Indian Ocean', 'The Arctic Ocean', 'The Pacific covers about one third of the whole planet.'],
        ['Which country is shaped like a boot?', 'Italy', 'Spain', 'Greece', 'Portugal', "Italy's boot even seems to kick the island of Sicily."],
        ['On which continent is Egypt?', 'Africa', 'Asia', 'Europe', 'South America', 'The Nile River flows north through Egypt to the sea.'],
        ['What is the capital city of Japan?', 'Tokyo', 'Kyoto', 'Osaka', 'Seoul', 'Tokyo is one of the biggest cities in the world.'],
      ],
      teen: [
        ['What is the capital city of Australia?', 'Canberra', 'Sydney', 'Melbourne', 'Perth', 'Canberra was built as a compromise between Sydney and Melbourne.'],
        ['Which is the largest hot desert in the world?', 'The Sahara', 'The Gobi', 'The Kalahari', 'The Arabian', 'The Sahara is about as big as the United States.'],
        ["Mount Kilimanjaro, Africa's tallest mountain, is in which country?", 'Tanzania', 'Kenya', 'Uganda', 'Ethiopia', 'Kilimanjaro is a volcano that rises about 5,895 meters (19,341 feet).'],
        ['Which strait separates Spain from Morocco?', 'Strait of Gibraltar', 'Bosphorus', 'Strait of Hormuz', 'Strait of Messina', 'At its narrowest it is only about 14 km (9 miles) wide.'],
        ['Which is the largest country in the world by area?', 'Russia', 'Canada', 'China', 'United States', 'Russia spans eleven time zones.'],
      ],
    },
    history: {
      keys: ['history', 'ancient', 'war', 'president', 'king', 'pirate', 'viking', 'castle', 'knight', 'egypt'],
      little: [
        ['What giant stone tombs did the ancient Egyptians build for their pharaohs?', 'Pyramids', 'Igloos', 'Windmills', 'Castles', 'The Great Pyramid of Giza is more than 4,000 years old.'],
        ['What did knights wear to protect themselves in battle?', 'Armor', 'Pajamas', 'Swimsuits', 'Aprons', 'Suits of armor were made of metal plates.'],
        ['Which giant animals lived long, long ago and are now only found as fossils?', 'Dinosaurs', 'Elephants', 'Horses', 'Dolphins', 'Dinosaurs lived millions of years before people were around.'],
        ['Who lived in castles long ago?', 'Kings and queens', 'Astronauts', 'Dolphins', 'Robots', 'Castles protected kings, queens and their families.'],
        ['Before cars, how did most people travel on land?', 'By horse and cart', 'By jet', 'By rocket', 'By submarine', 'Horses carried people and goods for thousands of years.'],
      ],
      mid: [
        ['Which ancient people built the Colosseum in Rome?', 'The Romans', 'The Greeks', 'The Egyptians', 'The Vikings', 'The Colosseum could hold about 50,000 people.'],
        ['Who was the first President of the United States?', 'George Washington', 'Abraham Lincoln', 'Thomas Jefferson', 'John Adams', 'Washington became president in 1789.'],
        ['What was the name of the ship that carried the Pilgrims to America in 1620?', 'The Mayflower', 'The Santa Maria', 'The Titanic', 'The Endeavour', 'The Mayflower sailed from England with about 100 passengers.'],
        ['Which wonder of the ancient world still stands near Cairo, Egypt?', 'The Great Pyramid of Giza', 'The Colossus of Rhodes', 'The Hanging Gardens', 'The Lighthouse of Alexandria', 'It is the only one of the Seven Wonders still standing.'],
        ['What were the ships of the Vikings called?', 'Longships', 'Galleons', 'Gondolas', 'Clippers', 'Longships were fast, narrow boats that could sail rivers and oceans.'],
      ],
      teen: [
        ['In which year did World War II end?', '1945', '1939', '1943', '1950', 'Germany surrendered in May 1945 and Japan in September 1945.'],
        ['Who was the main author of the Declaration of Independence?', 'Thomas Jefferson', 'Benjamin Franklin', 'George Washington', 'John Hancock', 'It was adopted on July 4, 1776.'],
        ['In which country did the Renaissance begin?', 'Italy', 'France', 'England', 'Spain', 'It began in Florence in the 1300s and spread across Europe.'],
        ['Which wall fell in 1989, symbolizing the end of the division of Germany?', 'The Berlin Wall', 'The Great Wall', "Hadrian's Wall", 'The Western Wall', 'Germany reunified in October 1990.'],
        ['Julius Caesar and Augustus led which ancient civilization?', 'Rome', 'Greece', 'Persia', 'Egypt', "Augustus, Caesar's adopted heir, became Rome's first emperor in 27 BCE."],
      ],
    },
    math: {
      keys: ['math', 'maths', 'number', 'algebra', 'geometry', 'fraction', 'multiplication', 'arithmetic', 'counting'],
      little: [
        ['What is 2 + 3?', '5', '4', '6', '7', 'Counting on your fingers is a great way to add.'],
        ['How many sides does a triangle have?', '3', '4', '5', '2', 'Tri means three. A triangle has three sides and three corners.'],
        ['What is 10 − 4?', '6', '5', '7', '4', 'Subtracting means taking away.'],
        ['Which number comes right after 19?', '20', '18', '21', '30', 'After 19 we start a new group of ten: twenty.'],
        ['How many days are in one week?', '7', '5', '6', '10', 'The days are Monday, Tuesday, Wednesday, Thursday, Friday, Saturday and Sunday.'],
      ],
      mid: [
        ['What is 7 × 8?', '56', '54', '48', '63', 'A handy trick: 5, 6, 7, 8 gives 56 = 7 × 8.'],
        ['What is half of 150?', '75', '50', '70', '80', 'Half of 100 is 50 and half of 50 is 25, so half of 150 is 75.'],
        ['How many degrees are in a right angle?', '90', '45', '180', '100', 'The corner of a square is a right angle.'],
        ['What is the name of a shape with six straight sides?', 'Hexagon', 'Pentagon', 'Octagon', 'Heptagon', 'Honeycomb cells are hexagons.'],
        ['What is 25% of 80?', '20', '25', '15', '40', '25% is one quarter, and a quarter of 80 is 20.'],
      ],
      teen: [
        ['What is the value of pi rounded to two decimal places?', '3.14', '3.41', '3.12', '3.16', "Pi is the ratio of a circle's circumference to its diameter."],
        ['What is the square root of 144?', '12', '14', '11', '16', '12 × 12 = 144.'],
        ['In a right triangle, what is the longest side called?', 'Hypotenuse', 'Adjacent', 'Opposite', 'Tangent', "Pythagoras' theorem says a² + b² = c² for the sides of a right triangle."],
        ['What is 15% of 200?', '30', '15', '20', '45', '10% of 200 is 20, and 5% is 10. Add them to get 30.'],
        ['If 3x + 5 = 20, what is x?', '5', '3', '6', '15', 'Subtract 5 to get 3x = 15, then divide by 3.'],
      ],
    },
    sports: {
      keys: ['sport', 'soccer', 'football', 'basketball', 'baseball', 'tennis', 'olympic', 'game', 'athlet', 'swim'],
      little: [
        ['In which sport do you kick a ball into a net to score a goal?', 'Soccer', 'Tennis', 'Swimming', 'Golf', 'Soccer is called football in most of the world.'],
        ['What do you use to hit a baseball?', 'A bat', 'A racket', 'A net', 'A paddle', 'Baseball bats are often made of wood.'],
        ['Which sport uses a hoop and a big orange ball?', 'Basketball', 'Baseball', 'Bowling', 'Golf', 'Players score by shooting the ball through the hoop.'],
        ['What do you wear on your feet to glide across ice?', 'Ice skates', 'Flippers', 'Sandals', 'Snowshoes', 'Ice skates have a thin metal blade on the bottom.'],
        ['What color is a tennis ball usually?', 'Yellow', 'Red', 'Blue', 'Purple', 'Tennis balls are bright yellow so players and fans can see them easily.'],
      ],
      mid: [
        ['How many players from one team are on the field in a soccer match?', '11', '9', '10', '12', 'A full soccer team has 11 players, including the goalkeeper.'],
        ['In which sport would you do a slam dunk?', 'Basketball', 'Volleyball', 'Tennis', 'Hockey', 'A slam dunk is when a player jumps and pushes the ball down through the hoop.'],
        ['How many rings are on the Olympic flag?', 'Five', 'Four', 'Six', 'Seven', 'The five rings stand for the five regions of the world joined together by sport.'],
        ['Which sport is played at Wimbledon?', 'Tennis', 'Golf', 'Cricket', 'Rugby', 'Wimbledon is a famous tennis tournament held in London.'],
        ['How many points is a touchdown worth in American football?', 'Six', 'Three', 'Seven', 'Five', 'Teams can then try for an extra point or a two-point conversion.'],
      ],
      teen: [
        ["Which country has won the most FIFA men's World Cup titles?", 'Brazil', 'Germany', 'Italy', 'Argentina', "Brazil's winning years include 1958, 1962, 1970, 1994 and 2002."],
        ['In tennis, what is a score of zero called?', 'Love', 'Nil', 'Zip', 'Duck', "No one is certain why, but one idea is that it comes from the French word for egg, l'oeuf."],
        ['About how long is a marathon?', '42 kilometers (26.2 miles)', '21 kilometers (13.1 miles)', '50 kilometers (31 miles)', '30 kilometers (18.6 miles)', 'The distance is 42.195 km, a length first used at the 1908 London Olympics.'],
        ["Which sport uses the words 'birdie', 'eagle' and 'bogey'?", 'Golf', 'Cricket', 'Badminton', 'Baseball', 'A birdie is one stroke under par on a hole.'],
        ['In which city were the first modern Olympic Games held in 1896?', 'Athens', 'Paris', 'London', 'Rome', 'The Games returned to Greece, home of the ancient Olympics.'],
      ],
    },
    food: {
      keys: ['food', 'cook', 'bake', 'cuisine', 'fruit', 'vegetable', 'nutrition', 'kitchen', 'pizza', 'candy'],
      little: [
        ['Which yellow fruit do monkeys love to eat?', 'Banana', 'Apple', 'Grape', 'Cherry', 'Bananas grow in bunches called hands.'],
        ['What do cows give us to drink?', 'Milk', 'Juice', 'Soda', 'Tea', 'Milk is also used to make cheese, butter and yogurt.'],
        ['Which orange vegetable do rabbits love?', 'Carrot', 'Broccoli', 'Pea', 'Potato', 'Carrots are roots: they grow underground.'],
        ['What is bread mostly made from?', 'Flour', 'Cheese', 'Honey', 'Butter', 'Flour is made by grinding wheat.'],
        ['Which fruit has its seeds on the outside?', 'Strawberry', 'Apple', 'Banana', 'Grape', 'A strawberry has about 200 tiny seeds on its skin.'],
      ],
      mid: [
        ['Pizza first became famous in which country?', 'Italy', 'France', 'Greece', 'Mexico', 'Modern pizza comes from the city of Naples.'],
        ['What is guacamole mostly made from?', 'Avocado', 'Cucumber', 'Lime', 'Peas', 'Avocados are creamy because they are full of healthy fats.'],
        ['Which nutrient helps build and repair your muscles?', 'Protein', 'Sugar', 'Fiber', 'Salt', 'Eggs, beans, fish and meat have lots of protein.'],
        ['Sushi comes from which country?', 'Japan', 'China', 'Thailand', 'India', 'Sushi often has rice, seaweed and fish.'],
        ['Oranges are famous for being full of which vitamin?', 'Vitamin C', 'Vitamin D', 'Vitamin K', 'Vitamin B12', 'Vitamin C helps your body heal and fight germs.'],
      ],
      teen: [
        ['Which spice is usually the most expensive by weight?', 'Saffron', 'Vanilla', 'Cinnamon', 'Black pepper', 'Saffron threads are picked by hand from crocus flowers.'],
        ['Hummus is made mainly from which ingredient?', 'Chickpeas', 'Lentils', 'Black beans', 'Peanuts', 'Chickpeas are also called garbanzo beans.'],
        ['Which country grows the most coffee in the world?', 'Brazil', 'Colombia', 'Vietnam', 'Ethiopia', 'Brazil has been the top coffee producer for over 150 years.'],
        ['What process do yeast cells use to make bread dough rise?', 'Fermentation', 'Evaporation', 'Filtration', 'Condensation', 'Yeast eat sugar and make bubbles of carbon dioxide gas.'],
        ['Which pigment gives carrots their orange color?', 'Beta-carotene', 'Chlorophyll', 'Melanin', 'Hemoglobin', 'Your body can turn beta-carotene into vitamin A.'],
      ],
    },
    arts: {
      keys: ['art', 'music', 'movie', 'film', 'book', 'read', 'song', 'paint', 'draw', 'instrument', 'literature', 'story', 'theater'],
      little: [
        ['Which instrument has black and white keys?', 'Piano', 'Drum', 'Trumpet', 'Violin', 'Pressing a key makes a hammer hit a string inside the piano.'],
        ['What color do you get when you mix blue and yellow paint?', 'Green', 'Purple', 'Orange', 'Brown', 'Mixing paint colors is a fun way to learn about color.'],
        ['Which instrument do you play by hitting it with sticks?', 'Drum', 'Flute', 'Harp', 'Violin', 'Drums keep the beat in a band.'],
        ['Which of these is a primary color of paint?', 'Red', 'Green', 'Orange', 'Purple', 'Red, yellow and blue can be mixed to make lots of other colors.'],
        ['Who lost a glass slipper at the ball in a famous fairy tale?', 'Cinderella', 'Snow White', 'Rapunzel', 'Belle', 'The story of Cinderella is hundreds of years old.'],
      ],
      mid: [
        ['How many strings does a violin have?', 'Four', 'Six', 'Five', 'Eight', 'A violin is played with a bow.'],
        ['Who painted the Mona Lisa?', 'Leonardo da Vinci', 'Michelangelo', 'Vincent van Gogh', 'Pablo Picasso', 'Leonardo painted it about 500 years ago.'],
        ['Which instrument family does the trumpet belong to?', 'Brass', 'Woodwind', 'Strings', 'Percussion', 'Brass instruments make sound when you buzz your lips.'],
        ['In music, what is tempo?', 'How fast or slow the music is', 'How loud the music is', 'How high a note sounds', 'The words of a song', 'Allegro means fast and adagio means slow.'],
        ["Who wrote the play 'Romeo and Juliet'?", 'William Shakespeare', 'Charles Dickens', 'Mark Twain', 'Jane Austen', 'Shakespeare lived about 400 years ago.'],
      ],
      teen: [
        ["Which artist painted 'The Starry Night'?", 'Vincent van Gogh', 'Claude Monet', 'Salvador Dalí', 'Edvard Munch', 'Van Gogh painted it in 1889 while staying at a hospital in France.'],
        ["Who composed the 'Moonlight Sonata'?", 'Ludwig van Beethoven', 'Wolfgang Amadeus Mozart', 'Johann Sebastian Bach', 'Frédéric Chopin', "The nickname 'Moonlight' was added after Beethoven died."],
        ["Who wrote 'Pride and Prejudice'?", 'Jane Austen', 'Emily Brontë', 'Charlotte Brontë', 'Mary Shelley', 'It was published in 1813.'],
        ['What are the three primary colors of light?', 'Red, green and blue', 'Red, yellow and blue', 'Cyan, magenta and yellow', 'Red, green and yellow', 'Screens mix red, green and blue light to make every color you see.'],
        ['In which Paris museum is the Mona Lisa displayed?', 'The Louvre', 'The Prado', 'The Uffizi', 'The British Museum', 'Millions of people visit the Louvre every year.'],
      ],
    },
    body: {
      keys: ['body', 'human', 'health', 'anatomy', 'medicine', 'brain', 'doctor'],
      little: [
        ['Which part of your body pumps blood around?', 'Heart', 'Stomach', 'Knee', 'Elbow', 'Your heart beats about 100,000 times a day.'],
        ['Which part of your body do you use to smell flowers?', 'Nose', 'Ears', 'Knees', 'Toes', 'Your nose can tell many different smells apart.'],
        ['What is the biggest organ on the outside of your body?', 'Skin', 'Hair', 'Nose', 'Hand', 'Your skin keeps germs out and keeps water in.'],
        ['How many fingers are on one hand, counting the thumb?', 'Five', 'Four', 'Six', 'Ten', 'Ten fingers on two hands makes counting easy.'],
        ['What do you use your teeth for?', 'Chewing food', 'Hearing', 'Smelling', 'Seeing', 'Brushing twice a day keeps your teeth healthy.'],
      ],
      mid: [
        ['Babies are born with about 300 bones. About how many does a grown-up have?', '206', '106', '306', '56', 'Some of a baby\'s bones join together as they grow.'],
        ['Which organs do you use to breathe?', 'Lungs', 'Kidneys', 'Stomach', 'Liver', 'Your lungs take in oxygen and let out carbon dioxide.'],
        ['What do red blood cells carry around your body?', 'Oxygen', 'Sugar', 'Light', 'Sound', 'Red blood cells carry oxygen from your lungs to the rest of your body.'],
        ['What is the hardest substance in the human body?', 'Tooth enamel', 'Bone', 'Fingernail', 'Skull', 'Enamel covers your teeth and protects them.'],
        ['Which part of the body is protected by the skull?', 'Brain', 'Heart', 'Lungs', 'Stomach', 'Your skull is made of several bones joined together.'],
      ],
      teen: [
        ['What is the largest internal organ in the human body?', 'Liver', 'Heart', 'Lung', 'Stomach', 'The liver cleans your blood and helps digest food.'],
        ['Your skin makes which vitamin when it is in sunlight?', 'Vitamin D', 'Vitamin C', 'Vitamin A', 'Vitamin B12', 'Vitamin D helps your body use calcium for strong bones.'],
        ['How many chambers does a human heart have?', 'Four', 'Two', 'Three', 'Six', 'Two upper atria and two lower ventricles.'],
        ['Which is the longest bone in the human body?', 'Femur', 'Tibia', 'Humerus', 'Fibula', 'The femur is your thigh bone.'],
        ['Which part of the brain mostly controls balance and coordination?', 'Cerebellum', 'Cerebrum', 'Hippocampus', 'Brain stem', 'The cerebellum helps you ride a bike without thinking about it.'],
      ],
    },
  };

  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function topicFor(name) {
    const n = norm(name);
    if (!n) return null;
    let best = null;
    let bestLen = 0;
    for (const id of Object.keys(TOPICS)) {
      if (n === id) return id;
      for (const k of TOPICS[id].keys) {
        if (n.includes(k) && k.length > bestLen) {
          best = id;
          bestLen = k.length;
        }
      }
    }
    return best;
  }

  function tierFor(age) {
    return age <= 8 ? 'little' : age <= 12 ? 'mid' : 'teen';
  }

  function row(r) {
    return { q: r[0], a: r[1], w: [r[2], r[3], r[4]], f: r[5] };
  }

  // Pick a question for a topic name and player age that is not in `asked`
  // (a Set of normalized question texts). Unknown topics get a general
  // question from any subject, flagged generic.
  function pick(topicName, age, asked) {
    const tier = tierFor(age);
    const order = tier === 'little' ? ['little', 'mid', 'teen'] : tier === 'mid' ? ['mid', 'little', 'teen'] : ['teen', 'mid', 'little'];
    const id = topicFor(topicName);
    const ids = id ? [id] : Object.keys(TOPICS);
    const generic = !id;
    for (const t of order) {
      const pool = [];
      for (const i of ids) for (const r of TOPICS[i][t]) if (!asked.has(norm(r[0]))) pool.push(r);
      if (pool.length) {
        const out = row(pool[Math.floor(Math.random() * pool.length)]);
        out.generic = generic;
        return out;
      }
    }
    // everything has been asked: allow a repeat
    const all = [];
    for (const i of ids) for (const r of TOPICS[i][tier]) all.push(r);
    const out = row(all[Math.floor(Math.random() * all.length)]);
    out.generic = generic;
    out.repeat = true;
    return out;
  }

  const api = { TOPICS, topicFor, tierFor, pick, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WQBank = api;
})(typeof window !== 'undefined' ? window : globalThis);
