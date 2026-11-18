-- Messages now name only the items involved. {more} adds "The rest will follow." when other items are still pending.
-- Only templates the owner has not edited are changed.
update message_templates set body = 'Good news {customer_name} ji! Ready for pickup at {shop_name}: {items} (Token #{token}).{more} Details: {link}'
  where key = 'ready' and body = 'Good news {customer_name} ji! Your {items} (Token #{token}) is ready for pickup at {shop_name}. Details: {link}';
update message_templates set body = 'Reminder: {items} (Token #{token}) ready and waiting at {shop_name}. Please collect at your convenience.'
  where key = 'reminder' and body = 'Reminder: your {items} (Token #{token}) is ready and waiting at {shop_name}. Please collect at your convenience.';
update message_templates set body = 'Sorry {customer_name} ji, {items} (Token #{token}) need a little more time. We will message you as soon as ready.'
  where key = 'delay' and body = 'Sorry {customer_name} ji, your {items} (Token #{token}) needs a little more time. We will message you as soon as it is ready.';
update message_templates set body = 'Thank you {customer_name} ji! Token #{token} ({items}) was collected on {delivered_at} by {collected_by}.{more} If this was not you, please call us on {shop_phone}.'
  where key = 'delivered' and body = 'Thank you {customer_name} ji! Token #{token} ({items}) was collected on {delivered_at} by {collected_by}. If this was not you, please call us on {shop_phone}.';
