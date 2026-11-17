const Cart = require("../models/cart.models");
const Product = require("../models/product.models");




const AddToCart = async (req, res) => {
    const { productId, quantity } = req.body;
    const qty = quantity ? parseInt(quantity) : 1;

    if (!productId || !Number.isInteger(qty) || qty <= 0) {
        return res.status(400).json({ message: 'Valid productId and positive integer quantity are required.' });
    }

    try {
       const product = await Product.findOne({ _id: productId, isActive: true });
       if (!product) {
        return res.status(404).json({ message: 'Product not found or currently unavailable.' });
       }

       if (product.stock < qty){
        return res.status(400).json({ message: 'No available stock to meet this product quantity.' });
       }

       let cart = await Cart.findOne({ buyerId: req.user._id });

       if (!cart) {
        cart = new Cart({
           buyerId: req.user._id,
           items: [{ productId, quantity: qty }] 
        });

    } else {
        const existingItemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
        if (existingItemIndex > -1) {
        cart.items[existingItemIndex].quantity += qty;

                } else {
                    cart.items.push({ productId, quantity: qty });
                }
                cart.updatedAt = Date.now();
       }

       await cart.save();
       return res.status(200).json({ message: 'Item added to cart', cart });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Failed to add item to cart', details: error.message });
    }
};


const GetCart = async (req, res) => {
    try {
        const cart = await Cart.findOne({ buyerId: req.user._id })
        .populate('items.productId', 'title priceKobo stock vendorId isActive');

        if (!cart || cart.items.length === 0) {
            return res.status(200).json({ items: [], totalKobo: o });
        }

        let totalKobo = o;
        cart.items.forEach(item => {
            if (item.productId && item.productId.isActive) {
                totalKobo += item.productId.priceKobo * item.quantity;
            }
        });

        return res.status(200).json({ cartId: cart._id, items: cart.items, totalKobo });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Failed to retrieve cart.', details: error.message });
    }
};


const RemoveFromCart = async (req, res) => {
    const { productId } = req.params;

    try {
       const cart = await Cart.findOne({ buyerId: req.user._id }) ;
       if (!cart) {
        return res.status(404).json({ message: 'Cart not found,' });
       }

       cart.items = cart.items.filter(item => item.productId.toString() !== productId);
       cart.updatedAt = Date.now();
       await cart.save();

       return res.status(200).json({ message: 'Item removed from cart', cart });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Failed to remove item from cart', details: error.message });
    }
};

module.exports = { AddToCart, GetCart, RemoveFromCart };