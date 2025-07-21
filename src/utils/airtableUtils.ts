import Airtable from 'airtable';

// Airtable configuration - you'll need to set these environment variables
const AIRTABLE_API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY || '';
const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID || 'appFMHAYZrTskpmdX';

// Table IDs for the new normalized structure
const TABLES = {
  CUSTOMERS: 'tblUS7uf11axEmL56',
  PRODUCTS: 'tblJ0hgzvDXWgQGmK',
  ORDERS: 'tblTq25QawVDHTTkV',
  ORDER_ITEMS: 'tblgV4XGeQE3VL9CW'
};

// Check if Airtable is properly configured
const isAirtableConfigured = () => {
  return AIRTABLE_API_KEY && AIRTABLE_BASE_ID;
};

// Initialize Airtable only if properly configured
let base: any = null;
if (isAirtableConfigured()) {
  try {
    base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
  } catch (error) {
    console.warn('⚠️ AIRTABLE WARNING - Failed to initialize Airtable:', error);
    base = null;
  }
} else {
  console.warn('⚠️ AIRTABLE WARNING - Airtable not configured. Missing API key or Base ID.');
}

interface OrderData {
  customerInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    fullName: string;
  };
  orderDetails: {
    package: string;
    packagePrice: string;
    packageFeatures: string;
    totalAmount: string;
    couponCode?: string;
    discountAmount?: string;
    digitizingSpeed: string;
    digitizingTime: string;
    digitizingPrice: string;
    addOns: string[];
    // Detailed add-on breakdown
    addOnDetails?: {
      photoRestoration?: { selected: boolean; cost: number };
      videoEnhancement?: { selected: boolean; cost: number };
      digitalDelivery?: { selected: boolean; cost: number };
      expressShipping?: { selected: boolean; cost: number };
      storageUpgrade?: { selected: boolean; cost: number };
      backupCopies?: { selected: boolean; cost: number };
    };
    // Detailed digitizing speed breakdown
    speedDetails?: {
      standardSpeed?: { selected: boolean; cost: number; timeframe: string };
      expressSpeed?: { selected: boolean; cost: number; timeframe: string };
      rushSpeed?: { selected: boolean; cost: number; timeframe: string };
    };
  };
  paymentMethod: string;
  timestamp: string;
  orderId?: string;
}

// Helper function to find or create customer
const findOrCreateCustomer = async (customerInfo: any) => {
  try {
    // First, try to find existing customer by email
    const existingCustomers = await base(TABLES.CUSTOMERS).select({
      filterByFormula: `{Email} = "${customerInfo.email}"`
    }).firstPage();

    if (existingCustomers.length > 0) {
      console.log('✅ AIRTABLE - Found existing customer:', existingCustomers[0].id);
      return existingCustomers[0];
    }

    // Create new customer if not found
    const customerFields = {
      'Name': customerInfo.fullName,
      'Email': customerInfo.email,
      'Phone': customerInfo.phone,
      'Shipping Address': `${customerInfo.address}\n${customerInfo.city}, ${customerInfo.state} ${customerInfo.zipCode}`
    };

    const newCustomer = await base(TABLES.CUSTOMERS).create([{ fields: customerFields }]);
    console.log('✅ AIRTABLE - Created new customer:', newCustomer[0].id);
    return newCustomer[0];

  } catch (error) {
    console.error('❌ AIRTABLE ERROR - Failed to find/create customer:', error);
    throw error;
  }
};

// Helper function to find or create product
const findOrCreateProduct = async (productName: string, price: number) => {
  try {
    // Try to find existing product
    const existingProducts = await base(TABLES.PRODUCTS).select({
      filterByFormula: `{Product Name} = "${productName}"`
    }).firstPage();

    if (existingProducts.length > 0) {
      console.log('✅ AIRTABLE - Found existing product:', existingProducts[0].id);
      return existingProducts[0];
    }

    // Create new product if not found
    const productFields = {
      'Product Name': productName,
      'Description': `Heritage Box digitization service - ${productName}`,
      'Price': price,
      'SKU': `HB-${productName.replace(/\s+/g, '-').toUpperCase()}`,
      'Stock Quantity': 999 // Unlimited digital service
    };

    const newProduct = await base(TABLES.PRODUCTS).create([{ fields: productFields }]);
    console.log('✅ AIRTABLE - Created new product:', newProduct[0].id);
    return newProduct[0];

  } catch (error) {
    console.error('❌ AIRTABLE ERROR - Failed to find/create product:', error);
    throw error;
  }
};

export const sendOrderToAirtable = async (orderData: OrderData) => {
  // Check if Airtable is configured before attempting to send
  if (!isAirtableConfigured()) {
    console.warn('⚠️ AIRTABLE WARNING - Airtable not configured. Order will not be sent to Airtable.');
    console.warn('⚠️ AIRTABLE WARNING - Please set VITE_AIRTABLE_API_KEY and VITE_AIRTABLE_BASE_ID environment variables.');
    return null;
  }

  if (!base) {
    console.warn('⚠️ AIRTABLE WARNING - Airtable base not initialized. Order will not be sent to Airtable.');
    return null;
  }

  try {
    console.log('📊 AIRTABLE - Sending order data to Airtable:', orderData);

    // Step 1: Find or create customer
    const customer = await findOrCreateCustomer(orderData.customerInfo);

    // Step 2: Find or create main product (package)
    const packagePrice = parseFloat(orderData.orderDetails.packagePrice.replace('$', ''));
    const mainProduct = await findOrCreateProduct(orderData.orderDetails.package, packagePrice);

    // Step 3: Create the order
    const orderNumber = orderData.orderId;
    const orderFields = {
      'Order Number': orderNumber,
      'Customer': [customer.id],
      'Order Date': new Date().toISOString().split('T')[0], // YYYY-MM-DD format
      'Status': 'Pending',
      'Total Amount': parseFloat(orderData.orderDetails.totalAmount.replace('$', '')),
      'Promo Code': orderData.orderDetails.couponCode
    };

    const newOrder = await base(TABLES.ORDERS).create([{ fields: orderFields }]);
    console.log('✅ AIRTABLE - Created new order:', newOrder[0].id);

    // Step 4: Create order items
    const orderItems = [];

    // Main package item
    const discountPercentage = orderData.orderDetails.couponCode ? parseFloat(orderData.orderDetails.discountAmount.replace('$', '')) / (parseFloat(orderData.orderDetails.totalAmount.replace('$', '')) + parseFloat(orderData.orderDetails.discountAmount.replace('$', ''))) : 0;
    const mainItemDiscount = packagePrice * discountPercentage;
    const mainItemFields = {
      'Item ID': `${orderNumber}-001`,
      'Order': [newOrder[0].id],
      'Product': [mainProduct.id],
      'Quantity': 1,
      'Unit Price': packagePrice,
      'Line Total': packagePrice - mainItemDiscount,
      'Discount Amount': mainItemDiscount
    };
    orderItems.push({ fields: mainItemFields });

    // Add-on items
    const addOnDetails = orderData.orderDetails.addOnDetails || {};
    let itemCounter = 2;

    for (const [addOnKey, addOnData] of Object.entries(addOnDetails)) {
      if (addOnData.selected && addOnData.cost > 0) {
        const addOnName = addOnKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
        const addOnProduct = await findOrCreateProduct(`Add-on: ${addOnName}`, addOnData.cost);
        
        const addOnDiscount = addOnData.cost * discountPercentage;
        const addOnItemFields = {
          'Item ID': `${orderNumber}-${itemCounter.toString().padStart(3, '0')}`,
          'Order': [newOrder[0].id],
          'Product': [addOnProduct.id],
          'Quantity': 1,
          'Unit Price': addOnData.cost,
          'Line Total': addOnData.cost - addOnDiscount,
          'Discount Amount': addOnDiscount
        };
        orderItems.push({ fields: addOnItemFields });
        itemCounter++;
      }
    }

    // Speed upgrade items
    const speedDetails = orderData.orderDetails.speedDetails || {};
    for (const [speedKey, speedData] of Object.entries(speedDetails)) {
      if (speedData.selected && speedData.cost > 0) {
        const speedName = speedKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
        const speedProduct = await findOrCreateProduct(`Speed: ${speedName}`, speedData.cost);
        
        const speedDiscount = speedData.cost * discountPercentage;
        const speedItemFields = {
          'Item ID': `${orderNumber}-${itemCounter.toString().padStart(3, '0')}`,
          'Order': [newOrder[0].id],
          'Product': [speedProduct.id],
          'Quantity': 1,
          'Unit Price': speedData.cost,
          'Line Total': speedData.cost - speedDiscount,
          'Discount Amount': speedDiscount
        };
        orderItems.push({ fields: speedItemFields });
        itemCounter++;
      }
    }

    // Create all order items
    if (orderItems.length > 0) {
      const createdOrderItems = await base(TABLES.ORDER_ITEMS).create(orderItems);
      console.log(`✅ AIRTABLE - Created ${createdOrderItems.length} order items`);
    }

    console.log('✅ AIRTABLE SUCCESS - Order fully processed:', orderNumber);
    return {
      customer,
      order: newOrder[0],
      orderNumber,
      itemsCount: orderItems.length
    };
    
  } catch (error) {
    console.error('❌ AIRTABLE ERROR - Failed to create order:', error);
    
    // Log more details about the error
    if (error.statusCode) {
      console.error('❌ AIRTABLE ERROR - Status Code:', error.statusCode);
      console.error('❌ AIRTABLE ERROR - Error Message:', error.message);
    }
    
    // Don't throw the error - we don't want to break the checkout process
    // Just log it for debugging
    console.error('❌ AIRTABLE ERROR - Order data that failed:', JSON.stringify(orderData, null, 2));
    
    // Could optionally send to a fallback system or email alert here
    return null;
  }
};

// Function to test Airtable connection
export const testAirtableConnection = async () => {
  if (!isAirtableConfigured()) {
    console.warn('⚠️ AIRTABLE TEST - Airtable not configured. Cannot test connection.');
    return false;
  }

  if (!base) {
    console.warn('⚠️ AIRTABLE TEST - Airtable base not initialized. Cannot test connection.');
    return false;
  }

  try {
    console.log('🧪 AIRTABLE TEST - Testing connection...');
    
    // Try to fetch the first record from customers table to test connection
    const records = await base(TABLES.CUSTOMERS).select({
      maxRecords: 1
    }).firstPage();
    
    console.log('✅ AIRTABLE TEST - Connection successful');
    return true;
  } catch (error) {
    console.error('❌ AIRTABLE TEST - Connection failed:', error);
    return false;
  }
};

// Helper function to parse add-on details from checkout data
export const parseAddOnDetails = (addOns: string[], packageType: string) => {
  const addOnPrices = {
    'Photo Restoration': 15,
    'Video Enhancement': 25,
    'Digital Delivery': 10,
    'Express Shipping': 20,
    'Storage Upgrade': 35,
    'Backup Copies': 15
  };

  const addOnDetails = {
    photoRestoration: { selected: addOns.includes('Photo Restoration'), cost: addOns.includes('Photo Restoration') ? addOnPrices['Photo Restoration'] : 0 },
    videoEnhancement: { selected: addOns.includes('Video Enhancement'), cost: addOns.includes('Video Enhancement') ? addOnPrices['Video Enhancement'] : 0 },
    digitalDelivery: { selected: addOns.includes('Digital Delivery'), cost: addOns.includes('Digital Delivery') ? addOnPrices['Digital Delivery'] : 0 },
    expressShipping: { selected: addOns.includes('Express Shipping'), cost: addOns.includes('Express Shipping') ? addOnPrices['Express Shipping'] : 0 },
    storageUpgrade: { selected: addOns.includes('Storage Upgrade'), cost: addOns.includes('Storage Upgrade') ? addOnPrices['Storage Upgrade'] : 0 },
    backupCopies: { selected: addOns.includes('Backup Copies'), cost: addOns.includes('Backup Copies') ? addOnPrices['Backup Copies'] : 0 }
  };

  return addOnDetails;
};

// Helper function to parse speed details
export const parseSpeedDetails = (digitizingSpeed: string) => {
  const speedPrices = {
    'Standard (2-3 weeks)': { cost: 0, timeframe: '2-3 weeks' },
    'Express (1 week)': { cost: 50, timeframe: '1 week' },
    'Rush (3-5 days)': { cost: 100, timeframe: '3-5 days' }
  };

  const speedDetails = {
    standardSpeed: { 
      selected: digitizingSpeed.includes('Standard'), 
      cost: digitizingSpeed.includes('Standard') ? speedPrices['Standard (2-3 weeks)'].cost : 0,
      timeframe: digitizingSpeed.includes('Standard') ? speedPrices['Standard (2-3 weeks)'].timeframe : ''
    },
    expressSpeed: { 
      selected: digitizingSpeed.includes('Express'), 
      cost: digitizingSpeed.includes('Express') ? speedPrices['Express (1 week)'].cost : 0,
      timeframe: digitizingSpeed.includes('Express') ? speedPrices['Express (1 week)'].timeframe : ''
    },
    rushSpeed: { 
      selected: digitizingSpeed.includes('Rush'), 
      cost: digitizingSpeed.includes('Rush') ? speedPrices['Rush (3-5 days)'].cost : 0,
      timeframe: digitizingSpeed.includes('Rush') ? speedPrices['Rush (3-5 days)'].timeframe : ''
    }
  };

  return speedDetails;
};

// Function to get customer orders (useful for customer service)
export const getCustomerOrders = async (email: string) => {
  if (!isAirtableConfigured() || !base) {
    return null;
  }

  try {
    // Find customer by email
    const customers = await base(TABLES.CUSTOMERS).select({
      filterByFormula: `{Email} = "${email}"`
    }).firstPage();

    if (customers.length === 0) {
      return null;
    }

    const customer = customers[0];
    
    // Get orders for this customer
    const orders = await base(TABLES.ORDERS).select({
      filterByFormula: `{Customer} = "${customer.id}"`,
      sort: [{ field: 'Order Date', direction: 'desc' }]
    }).firstPage();

    return {
      customer: customer.fields,
      orders: orders.map(order => order.fields)
    };

  } catch (error) {
    console.error('❌ AIRTABLE ERROR - Failed to get customer orders:', error);
    return null;
  }
};
