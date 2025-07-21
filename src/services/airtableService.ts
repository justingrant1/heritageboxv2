import { getCustomerOrders } from '../utils/airtableUtils';
import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY || '';
const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID || 'appFMHAYZrTskpmdX';

// Table IDs
const TABLES = {
  CUSTOMERS: 'tblUS7uf11axEmL56',
  PRODUCTS: 'tblJ0hgzvDXWgQGmK',
  ORDERS: 'tblTq25QawVDHTTkV',
  ORDER_ITEMS: 'tblgV4XGeQE3VL9CW'
};

// Initialize Airtable
let base: any = null;
if (AIRTABLE_API_KEY && AIRTABLE_BASE_ID) {
  try {
    base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
  } catch (error) {
    console.warn('Failed to initialize Airtable for chat service:', error);
  }
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  sku: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  orderDate: string;
  status: string;
  totalAmount: number;
  promoCode?: string;
  items: OrderItem[];
}

export interface OrderItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  discountAmount?: number;
}

class AirtableService {
  private isConfigured(): boolean {
    return !!(AIRTABLE_API_KEY && AIRTABLE_BASE_ID && base);
  }

  // Look up customer orders by email or order number
  async lookupCustomerOrders(identifier: string): Promise<{
    customer: Customer | null;
    orders: Order[];
    message: string;
  }> {
    if (!this.isConfigured()) {
      return {
        customer: null,
        orders: [],
        message: "I'm unable to access order information right now. Please contact our support team directly for assistance with your order."
      };
    }

    try {
      // First try to find by order number
      if (identifier.match(/^[A-Z0-9-]+$/i)) {
        const orderResult = await this.lookupByOrderNumber(identifier);
        if (orderResult.order) {
          return {
            customer: orderResult.customer,
            orders: [orderResult.order],
            message: `Found your order ${orderResult.order.orderNumber}!`
          };
        }
      }

      // If not found by order number, try by email
      if (identifier.includes('@')) {
        const result = await getCustomerOrders(identifier);
        if (result && result.orders.length > 0) {
          const customer: Customer = {
            id: result.customer.id,
            name: result.customer.Name,
            email: result.customer.Email,
            phone: result.customer.Phone,
            address: result.customer['Shipping Address']
          };

          const orders: Order[] = await Promise.all(
            result.orders.map(async (orderRecord: any) => {
              const orderItems = await this.getOrderItems(orderRecord.id);
              return {
                id: orderRecord.id,
                orderNumber: orderRecord['Order Number'],
                customerId: customer.id,
                customerName: customer.name,
                customerEmail: customer.email,
                orderDate: orderRecord['Order Date'],
                status: orderRecord.Status,
                totalAmount: orderRecord['Total Amount'],
                promoCode: orderRecord['Promo Code'],
                items: orderItems
              };
            })
          );

          return {
            customer,
            orders,
            message: `Found ${orders.length} order${orders.length > 1 ? 's' : ''} for ${customer.email}`
          };
        }
      }

      return {
        customer: null,
        orders: [],
        message: `I couldn't find any orders for "${identifier}". Please double-check your order number or email address, or contact our support team for assistance.`
      };

    } catch (error) {
      console.error('Error looking up customer orders:', error);
      return {
        customer: null,
        orders: [],
        message: "I'm having trouble accessing order information right now. Please contact our support team directly for assistance."
      };
    }
  }

  // Look up order by order number
  private async lookupByOrderNumber(orderNumber: string): Promise<{
    customer: Customer | null;
    order: Order | null;
  }> {
    try {
      const orders = await base(TABLES.ORDERS).select({
        filterByFormula: `{Order Number} = "${orderNumber}"`,
        expand: ['Customer']
      }).firstPage();

      if (orders.length === 0) {
        return { customer: null, order: null };
      }

      const orderRecord = orders[0];
      const customerRecord = orderRecord.fields.Customer?.[0];

      if (!customerRecord) {
        return { customer: null, order: null };
      }

      // Get customer details
      const customerDetails = await base(TABLES.CUSTOMERS).find(customerRecord);
      const customer: Customer = {
        id: customerDetails.id,
        name: customerDetails.fields.Name,
        email: customerDetails.fields.Email,
        phone: customerDetails.fields.Phone,
        address: customerDetails.fields['Shipping Address']
      };

      // Get order items
      const orderItems = await this.getOrderItems(orderRecord.id);

      const order: Order = {
        id: orderRecord.id,
        orderNumber: orderRecord.fields['Order Number'],
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: customer.email,
        orderDate: orderRecord.fields['Order Date'],
        status: orderRecord.fields.Status,
        totalAmount: orderRecord.fields['Total Amount'],
        promoCode: orderRecord.fields['Promo Code'],
        items: orderItems
      };

      return { customer, order };

    } catch (error) {
      console.error('Error looking up order by number:', error);
      return { customer: null, order: null };
    }
  }

  // Get order items for an order
  private async getOrderItems(orderId: string): Promise<OrderItem[]> {
    try {
      const items = await base(TABLES.ORDER_ITEMS).select({
        filterByFormula: `{Order} = "${orderId}"`,
        expand: ['Product']
      }).firstPage();

      return items.map((item: any) => {
        const product = item.fields.Product?.[0];
        return {
          id: item.id,
          productName: product?.fields?.['Product Name'] || 'Unknown Product',
          quantity: item.fields.Quantity || 1,
          unitPrice: item.fields['Unit Price'] || 0,
          lineTotal: item.fields['Line Total'] || 0,
          discountAmount: item.fields['Discount Amount'] || 0
        };
      });

    } catch (error) {
      console.error('Error getting order items:', error);
      return [];
    }
  }

  // Get product information
  async getProducts(): Promise<Product[]> {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const products = await base(TABLES.PRODUCTS).select({
        sort: [{ field: 'Product Name', direction: 'asc' }]
      }).firstPage();

      return products.map((product: any) => ({
        id: product.id,
        name: product.fields['Product Name'],
        description: product.fields.Description || '',
        price: product.fields.Price || 0,
        sku: product.fields.SKU || ''
      }));

    } catch (error) {
      console.error('Error getting products:', error);
      return [];
    }
  }

  // Get pricing information for common packages
  async getPackagePricing(): Promise<{ [key: string]: number }> {
    if (!this.isConfigured()) {
      return {
        'Essential Package': 49,
        'Standard Package': 99,
        'Premium Package': 199
      };
    }

    try {
      const products = await this.getProducts();
      const packages = products.filter(p => 
        p.name.toLowerCase().includes('package') && 
        !p.name.toLowerCase().includes('add-on')
      );

      const pricing: { [key: string]: number } = {};
      packages.forEach(pkg => {
        pricing[pkg.name] = pkg.price;
      });

      return pricing;

    } catch (error) {
      console.error('Error getting package pricing:', error);
      // Return default pricing if there's an error
      return {
        'Essential Package': 49,
        'Standard Package': 99,
        'Premium Package': 199
      };
    }
  }

  // Format order information for chat display
  formatOrderInfo(order: Order): string {
    const statusEmoji = {
      'Pending': '⏳',
      'Processing': '🔄',
      'In Progress': '⚙️',
      'Completed': '✅',
      'Shipped': '📦',
      'Delivered': '🎉',
      'Cancelled': '❌'
    };

    let info = `**Order ${order.orderNumber}**\n`;
    info += `${statusEmoji[order.status as keyof typeof statusEmoji] || '📋'} Status: ${order.status}\n`;
    info += `📅 Order Date: ${order.orderDate}\n`;
    info += `💰 Total: $${order.totalAmount.toFixed(2)}\n`;
    
    if (order.promoCode) {
      info += `🎟️ Promo Code: ${order.promoCode}\n`;
    }

    if (order.items.length > 0) {
      info += `\n**Items:**\n`;
      order.items.forEach(item => {
        info += `• ${item.productName} - $${item.lineTotal.toFixed(2)}\n`;
      });
    }

    return info;
  }

  // Format customer orders for chat display
  formatCustomerOrders(customer: Customer, orders: Order[]): string {
    let info = `**Customer: ${customer.name}**\n`;
    info += `📧 Email: ${customer.email}\n`;
    
    if (customer.phone) {
      info += `📱 Phone: ${customer.phone}\n`;
    }

    info += `\n**Orders (${orders.length}):**\n\n`;

    orders.forEach(order => {
      info += this.formatOrderInfo(order) + '\n';
    });

    return info;
  }
}

export default new AirtableService();
