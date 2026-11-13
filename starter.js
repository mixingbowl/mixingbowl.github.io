// Starter recipes a new account can add with one tap.
export const STARTERS = [
{title:"Blueberry Pie",short:"Blueberry pie",art:"pie",color:"#4B57A8",yield:"8–10 slices",prep:"3 hrs (incl. crust chill)",cook:"70 min",total:"7 hrs (incl. cooling)",
 links:[{label:"Original recipe",url:"https://sallysbakingaddiction.com/best-blueberry-pie/"},{label:"Pie crust recipe",url:"https://sallysbakingaddiction.com/baking-basics-homemade-buttery-flaky-pie-crust/"}],
 ingredients:[
  {group:"Pie crust (makes top + bottom)",items:["2½ cups (315g) all-purpose flour, plus more for rolling","1 tsp salt","6 Tbsp (85g) unsalted butter, chilled & cubed","⅔ cup (130g) vegetable shortening, chilled","½ cup (120ml) ice-cold water"]},
  {group:"Filling",items:["6 cups (about 860g) fresh blueberries","⅔ cup (135g) granulated sugar","¼ cup (31g) all-purpose flour","2 Tbsp (14g) cornstarch","¼ tsp ground cinnamon","2 Tbsp (30ml) lemon juice","1 tsp lemon zest","1 Tbsp (14g) unsalted butter, cold, cut into small cubes"]},
  {group:"Topping",items:["1 large egg, beaten with 1 Tbsp milk (egg wash)","Coarse sugar for sprinkling, optional"]}],
 steps:[
  {section:"Make the crust (at least 2 hours ahead)",items:[
   {title:"Mix the dry",text:"Whisk the flour and salt together in a large bowl."},
   {title:"Cut in the fat",text:"Work the cold butter and shortening into the flour with a pastry cutter or two forks until it looks like coarse crumbs with some pea-size bits. Don't overwork it."},
   {title:"Add ice water",text:"Drizzle in ice water about a tablespoon at a time, stirring after each, just until the dough forms big clumps — usually around ½ cup total."},
   {title:"Shape two discs",text:"Turn the dough onto a floured counter and press it together. Cut in half and flatten each half into a 1-inch-thick disc."},
   {title:"Chill",text:"Wrap each disc tightly and refrigerate at least 2 hours (up to 5 days).",timers:[{label:"Crust chill",min:120}]}]},
  {section:"Filling & assembly",items:[
   {title:"Make the filling",text:"Stir together the blueberries, sugar, flour, cornstarch, cinnamon, lemon juice and zest. If it looks dry, mash a few berries. Let it sit while the oven heats."},
   {title:"Heat the oven",text:"Move a rack to the lower third and preheat to 425°F. Put a baking sheet on the bottom rack to catch drips."},
   {title:"Bottom crust",text:"Roll one disc into a 12-inch circle about ⅛\" thick and fit it into a 9-inch pie dish. Pour in the filling and dot with the butter cubes."},
   {title:"Lattice top",text:"Roll the second disc into a 12-inch circle, cut about ten 1-inch strips and weave them over the filling. Press the ends into the edge, trim and crimp with a fork."},
   {title:"Egg wash",text:"Brush the top and edges with egg wash and sprinkle with coarse sugar if you like."}]},
  {section:"Bake & cool",items:[
   {title:"Bake hot",text:"Bake at 425°F for 25 minutes.",timers:[{label:"Pie at 425°",min:25}]},
   {title:"Lower the heat & shield",text:"Turn the oven to 375°F and cover the crust edges with foil. Bake 40–50 minutes more, until bubbling everywhere including the center. Tent the top with foil if it browns too fast.",timers:[{label:"Pie at 375°",min:40},{label:"+10 min",min:10}]},
   {title:"Cool",text:"Cool on a rack at least 4 hours before slicing so the filling sets.",timers:[{label:"Cooling",min:240}]}]}],
 notes:["Leftovers keep in the fridge, covered, up to 5 days.","The filling can be made a day ahead."]},
{title:"Roasted Vegetable Butternut Squash Lasagna",short:"Squash lasagna",art:"lasagna",color:"#D9772B",yield:"12 servings",prep:"45 min",cook:"1 hr 45 min",total:"2 hrs 30 min",
 links:[{label:"Original recipe",url:"https://www.ambitiouskitchen.com/roasted-vegetable-butternut-squash-lasagna/"}],
 ingredients:[
  {group:"Roasted veggies",items:["1 red bell pepper, sliced","1 yellow bell pepper, sliced","1 red onion, thinly sliced","8 oz baby bella mushrooms, sliced","2 medium zucchini, sliced & quartered","½ tsp garlic powder","Salt and pepper","2 Tbsp olive oil"]},
  {group:"Butternut squash sauce",items:["1 large butternut squash (3+ lb)","⅔ cup milk (unsweetened almond suggested)","1 Tbsp brown sugar","¼ tsp ground cinnamon","¼ tsp ground nutmeg","¼ tsp ground ginger","¼ tsp allspice","½ tsp salt"]},
  {group:"Noodles & ricotta",items:["10 lasagna noodles","1 (15 oz) container ricotta","1 large egg","½ tsp salt"]},
  {group:"Layers & garnish",items:["3 cups (about 12 oz) shredded mozzarella, divided","½ cup grated parmesan, divided","Fresh parsley, chopped, for garnish"]}],
 steps:[
  {section:"Roast",items:[
   {title:"Preheat",text:"Heat the oven to 400°F."},
   {title:"Prep the veggies",text:"On a parchment-lined sheet, toss the peppers, onion, mushrooms and zucchini with the olive oil, garlic powder, salt and pepper. Spread out evenly."},
   {title:"Prep the squash",text:"Trim the ends, halve the squash lengthwise, then split each half again. Scoop out the seeds and lay the pieces flesh-side down on a second lined sheet."},
   {title:"Roast both trays",text:"Pull the veggies after about 30 minutes, once lightly golden. Roast the squash about 1 hour, until very tender. Leave the oven on.",timers:[{label:"Veggies",min:30},{label:"Squash",min:60}]}]},
  {section:"While it roasts",items:[
   {title:"Cook the noodles",text:"Boil the noodles 5–6 minutes, drain, and lay them flat on an oiled sheet so they don't stick.",timers:[{label:"Noodles",min:6}]},
   {title:"Ricotta mix",text:"Stir together the ricotta, egg, salt and pepper."},
   {title:"Squash sauce",text:"Scoop out the roasted squash and blend with the milk, sugar, spices, salt and pepper until smooth."}]},
  {section:"Layer & bake",items:[
   {title:"First layer",text:"In a 9×13 dish: ¾ cup squash sauce, 5 noodles, half the ricotta, half the veggies, ¾ cup mozzarella, a heaping cup of sauce and ¼ cup parmesan."},
   {title:"Second layer",text:"Repeat with 5 noodles, the rest of the ricotta and veggies, ¾ cup mozzarella, the remaining sauce and ¼ cup parmesan. Top with the last 1½ cups mozzarella."},
   {title:"Bake covered",text:"Cover with foil and bake 25 minutes.",timers:[{label:"Covered",min:25}]},
   {title:"Bake uncovered",text:"Remove the foil and bake 15–20 minutes more, until the cheese just starts to brown.",timers:[{label:"Uncovered",min:15}]},
   {title:"Rest & serve",text:"Top with parmesan and parsley and rest 15–20 minutes before slicing.",timers:[{label:"Resting",min:15}]}]}],
 notes:["You can roast the veggies and squash a day ahead."]},
{title:"Homemade Cake Pops",short:"Cake pops",art:"cakepops",color:"#D9487A",yield:"About 40 pops",prep:"2 hrs",cook:"36 min",total:"7 hrs (incl. chilling)",
 links:[{label:"Original recipe",url:"https://sallysbakingaddiction.com/homemade-cake-pops/"}],
 ingredients:[
  {group:"Cake",items:["1⅔ cups (209g) all-purpose flour","½ tsp baking powder","¼ tsp baking soda","½ tsp salt","½ cup (113g) unsalted butter, softened","1 cup (200g) granulated sugar","1 large egg, room temperature","2 tsp pure vanilla extract","1 cup (240ml) whole milk"]},
  {group:"Frosting",items:["7 Tbsp (99g) unsalted butter, softened","1¾ cups (210g) confectioners' sugar","2–3 tsp heavy cream","1 tsp pure vanilla extract"]},
  {group:"Coating",items:["24 oz (678g) candy melts","Sprinkles","40 lollipop sticks"]}],
 steps:[
  {section:"Bake the cake",items:[
   {title:"Prep",text:"Preheat the oven to 350°F and grease a 9-inch springform pan."},
   {title:"Dry ingredients",text:"Whisk the flour, baking powder, baking soda and salt."},
   {title:"Cream",text:"Beat the butter and sugar until fluffy, about 3 minutes. Beat in the egg and vanilla.",timers:[{label:"Creaming",min:3}]},
   {title:"Combine",text:"Add the dry ingredients and milk and mix on low. Stir out any lumps by hand and spread in the pan."},
   {title:"Bake",text:"Bake 30–36 minutes, until a toothpick comes out clean.",timers:[{label:"Cake",min:30},{label:"+6 min",min:6}]},
   {title:"Cool completely",text:"Let the cake cool all the way in the pan on a rack."}]},
  {section:"Frosting & cake balls",items:[
   {title:"Frosting",text:"Beat the butter until creamy, add the confectioners' sugar, cream and vanilla, then beat on high 3 minutes."},
   {title:"Mix in the cake",text:"Crumble the cooled cake over the frosting and beat on low until combined."},
   {title:"Roll",text:"Scoop 1-tablespoon portions and roll into balls."},
   {title:"Chill",text:"Chill 2 hours (or freeze 1 hour), then re-roll smooth. Keep them cold.",timers:[{label:"Fridge chill",min:120}]}]},
  {section:"Dip & decorate",items:[
   {title:"Melt the coating",text:"Microwave the candy melts in 20-second bursts, stirring between, until smooth."},
   {title:"Dip",text:"Dip a stick ½ inch into the coating, push it halfway into a cold ball, dunk to cover, tap off the excess, add sprinkles and stand upright to set."},
   {title:"Let them set",text:"Let the coating set about 1 hour. Store in the fridge up to 1 week.",timers:[{label:"Setting",min:60}]}]}],
 notes:["A tall, narrow cup makes dipping much easier."]}
];
