insert into tailors (name, is_in_house) values ('In-house', true);

insert into message_templates (key, label, body) values
('receipt',   'Receipt',   'Namaste {customer_name} ji 🙏 {shop_name} has received your {items} for alteration. Token #{token}, ready by {promised_date}. Please show this message when collecting. Details: {link}'),
('ready',     'Ready',     'Good news {customer_name} ji! Your {items} (Token #{token}) is ready for pickup at {shop_name}. Details: {link}'),
('reminder',  'Reminder',  'Reminder: your {items} (Token #{token}) is ready and waiting at {shop_name}. Please collect at your convenience.'),
('delay',     'Delay',     'Sorry {customer_name} ji, your {items} (Token #{token}) needs a little more time. We will message you as soon as it is ready.'),
('delivered', 'Delivered', 'Thank you {customer_name} ji! Token #{token} ({items}) was collected on {delivered_at} by {collected_by}. If this was not you, please call us on {shop_phone}.');

insert into shop_settings (shop_name, shop_phone, address, public_base_url)
values ('Singhvi Readymades', '0000000000', null, 'http://localhost:3000');
