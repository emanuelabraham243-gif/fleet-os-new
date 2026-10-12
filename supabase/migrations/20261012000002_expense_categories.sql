-- FleetOS: trip expense categories from the client intake sheet.
-- Their everyday trip costs: road allowance (DRIVER_ALLOWANCE), water/food, supplies, tire repair,
-- toll, lodging and loaders (LOADING). The four new codes are added; existing rows are unchanged.

alter table public.trip_expenses drop constraint trip_expenses_category_check;
alter table public.trip_expenses add constraint trip_expenses_category_check check (category in (
  'DRIVER_ALLOWANCE', 'FOOD_WATER', 'SUPPLIES', 'TIRE_REPAIR', 'TOLL', 'LODGING', 'LOADING',
  'FUEL', 'PARKING', 'REPAIR', 'FINE', 'OTHER'
));
