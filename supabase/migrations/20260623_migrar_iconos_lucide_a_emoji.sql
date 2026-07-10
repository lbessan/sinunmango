-- ─── Migrar iconos Lucide legacy → emoji ─────────────────────────────────────
-- Las cuentas viejas guardaban nombres de iconos Lucide (PascalCase, ej
-- "ShoppingCart") en categorias.icono / subcategorias.icono. El sistema ahora
-- renderiza imágenes 3D (Fluent Emoji) resueltas desde el emoji Unicode.
--
-- Este mapeo traduce los Lucide más comunes a su emoji equivalente. Los que no
-- estén en el mapa quedan como están y se muestran con el icono genérico 🏷️
-- hasta que el user los cambie con el picker. Espejo de LUCIDE_TO_EMOJI en
-- lib/emojis-catalogo.ts.

WITH mapa(lucide, emoji) AS (
  VALUES
    ('ShoppingCart','🛒'), ('ShoppingBasket','🛒'), ('Store','🛒'),
    ('Coffee','☕'), ('Utensils','🍴'), ('UtensilsCrossed','🥘'), ('Pizza','🍕'),
    ('Beef','🍔'), ('Sandwich','🍔'), ('Beer','🍺'), ('Wine','🍷'), ('Croissant','🥐'),
    ('IceCream','🍦'), ('IceCream2','🍦'), ('ShoppingBag','🛍️'), ('Cake','🍦'),
    ('Car','🚗'), ('Fuel','⛽'), ('Bus','🚌'), ('Train','🚇'), ('TrainFront','🚇'),
    ('Bike','🚲'), ('Plane','✈️'), ('MapPin','🅿️'), ('Milestone','🛣️'), ('Truck','🛍️'),
    ('Home','🏠'), ('House','🏠'), ('Building','🏘️'), ('Building2','🏘️'), ('Key','🔑'),
    ('Zap','⚡'), ('Droplet','💧'), ('Droplets','💧'), ('Flame','🔥'), ('Wifi','📡'),
    ('Satellite','📡'), ('SatelliteDish','📡'), ('Smartphone','📱'), ('Phone','📱'),
    ('Hammer','🛠️'), ('Wrench','🔧'), ('Sofa','🛋️'), ('Lamp','🛋️'), ('WashingMachine','🧺'),
    ('Pill','💊'), ('Cross','🏥'), ('Hospital','🏥'), ('Syringe','💉'), ('Stethoscope','🩺'),
    ('Activity','🩺'), ('Dumbbell','🏋️'), ('Glasses','👓'),
    ('GraduationCap','🎓'), ('BookOpen','📚'), ('Book','📚'), ('Library','📚'),
    ('Pencil','✏️'), ('PenLine','✏️'), ('Backpack','🎒'), ('Laptop','💻'), ('Monitor','💻'),
    ('Palette','🎨'), ('Briefcase','💼'), ('Shirt','👕'),
    ('Film','🎬'), ('Clapperboard','🎬'), ('Tv','📺'), ('Tv2','📺'), ('Music','🎵'),
    ('Music2','🎵'), ('Music4','🎵'), ('Gamepad','🎮'), ('Gamepad2','🎮'), ('Guitar','🎸'),
    ('Mic','🎤'), ('Mic2','🎤'), ('Ticket','🎟️'), ('PartyPopper','🎉'), ('Trophy','⚽'),
    ('Volleyball','⚽'), ('Tent','🎪'),
    ('Watch','👜'), ('Sparkles','💄'), ('Scissors','💇'),
    ('Gift','🎁'), ('Gem','💎'), ('Diamond','💎'),
    ('Dog','🐶'), ('Cat','🐱'), ('PawPrint','🐾'), ('Baby','👶'),
    ('Luggage','🧳'), ('Map','🗺️'), ('Umbrella','🏖️'), ('Hotel','🏨'), ('BedDouble','🏨'),
    ('Wallet','💰'), ('PiggyBank','💰'), ('DollarSign','💵'), ('Banknote','💵'),
    ('Landmark','🏦'), ('TrendingUp','📈'), ('LineChart','📈'), ('CreditCard','💳'),
    ('Target','🎯'), ('Handshake','🤝'), ('Dice5','🎰'),
    ('Tag','🏷️'), ('Tags','🏷️'), ('Package','📦'), ('FileText','📝'), ('StickyNote','📝'),
    ('Star','⭐'), ('Rocket','🚀'), ('Sprout','🌱'), ('Leaf','🌱'), ('Globe','🌍'),
    ('Brain','🧠'), ('Lightbulb','💡'), ('HeartPulse','🩺'), ('Heart','💊')
)
UPDATE categorias c
SET icono = m.emoji
FROM mapa m
WHERE c.icono = m.lucide;

WITH mapa(lucide, emoji) AS (
  VALUES
    ('ShoppingCart','🛒'), ('ShoppingBasket','🛒'), ('Store','🛒'),
    ('Coffee','☕'), ('Utensils','🍴'), ('UtensilsCrossed','🥘'), ('Pizza','🍕'),
    ('Beef','🍔'), ('Sandwich','🍔'), ('Beer','🍺'), ('Wine','🍷'), ('Croissant','🥐'),
    ('IceCream','🍦'), ('IceCream2','🍦'), ('ShoppingBag','🛍️'), ('Cake','🍦'),
    ('Car','🚗'), ('Fuel','⛽'), ('Bus','🚌'), ('Train','🚇'), ('TrainFront','🚇'),
    ('Bike','🚲'), ('Plane','✈️'), ('MapPin','🅿️'), ('Milestone','🛣️'), ('Truck','🛍️'),
    ('Home','🏠'), ('House','🏠'), ('Building','🏘️'), ('Building2','🏘️'), ('Key','🔑'),
    ('Zap','⚡'), ('Droplet','💧'), ('Droplets','💧'), ('Flame','🔥'), ('Wifi','📡'),
    ('Satellite','📡'), ('SatelliteDish','📡'), ('Smartphone','📱'), ('Phone','📱'),
    ('Hammer','🛠️'), ('Wrench','🔧'), ('Sofa','🛋️'), ('Lamp','🛋️'), ('WashingMachine','🧺'),
    ('Pill','💊'), ('Cross','🏥'), ('Hospital','🏥'), ('Syringe','💉'), ('Stethoscope','🩺'),
    ('Activity','🩺'), ('Dumbbell','🏋️'), ('Glasses','👓'),
    ('GraduationCap','🎓'), ('BookOpen','📚'), ('Book','📚'), ('Library','📚'),
    ('Pencil','✏️'), ('PenLine','✏️'), ('Backpack','🎒'), ('Laptop','💻'), ('Monitor','💻'),
    ('Palette','🎨'), ('Briefcase','💼'), ('Shirt','👕'),
    ('Film','🎬'), ('Clapperboard','🎬'), ('Tv','📺'), ('Tv2','📺'), ('Music','🎵'),
    ('Music2','🎵'), ('Music4','🎵'), ('Gamepad','🎮'), ('Gamepad2','🎮'), ('Guitar','🎸'),
    ('Mic','🎤'), ('Mic2','🎤'), ('Ticket','🎟️'), ('PartyPopper','🎉'), ('Trophy','⚽'),
    ('Volleyball','⚽'), ('Tent','🎪'),
    ('Watch','👜'), ('Sparkles','💄'), ('Scissors','💇'),
    ('Gift','🎁'), ('Gem','💎'), ('Diamond','💎'),
    ('Dog','🐶'), ('Cat','🐱'), ('PawPrint','🐾'), ('Baby','👶'),
    ('Luggage','🧳'), ('Map','🗺️'), ('Umbrella','🏖️'), ('Hotel','🏨'), ('BedDouble','🏨'),
    ('Wallet','💰'), ('PiggyBank','💰'), ('DollarSign','💵'), ('Banknote','💵'),
    ('Landmark','🏦'), ('TrendingUp','📈'), ('LineChart','📈'), ('CreditCard','💳'),
    ('Target','🎯'), ('Handshake','🤝'), ('Dice5','🎰'),
    ('Tag','🏷️'), ('Tags','🏷️'), ('Package','📦'), ('FileText','📝'), ('StickyNote','📝'),
    ('Star','⭐'), ('Rocket','🚀'), ('Sprout','🌱'), ('Leaf','🌱'), ('Globe','🌍'),
    ('Brain','🧠'), ('Lightbulb','💡'), ('HeartPulse','🩺'), ('Heart','💊')
)
UPDATE subcategorias s
SET icono = m.emoji
FROM mapa m
WHERE s.icono = m.lucide;
