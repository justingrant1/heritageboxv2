// Function to generate sequential order number
export const generateOrderNumber = () => {
  const baseNumber = 100420;
  const increment = 5;
  const storedCount = localStorage.getItem('hb_order_count');
  const currentCount = storedCount ? parseInt(storedCount) : 0;
  const newCount = currentCount + 1;
  localStorage.setItem('hb_order_count', newCount.toString());
  return `HB${baseNumber + (currentCount * increment)}`;
};
