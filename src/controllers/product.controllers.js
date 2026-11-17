const Product = require("../models/product.models");



const CreateProduct = async (req, res) => {
    const { title, description, priceKobo, stock, images } = req.body;

    if (!title || !description || !priceKobo) {
        return res.status(400).json({ message: 'Title, description and priceKobo are required.' });
    }

    if (!Number.isInteger(priceKobo) || priceKobo <= 0) {
        return res.status(400).json({ message: 'priceKobo must be a positive whole integer in Kobo.' });
    }

    try {
        const product = new Product({
            vendorId: req.user._id,
            title,
            description,
            priceKobo,
            stock: stock !== undefined ? stock : 1,
            images: image || []
        });

        await product.save();
        return res.status(201).json({ message: 'Product created successfully.', product });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Failed to create product.', details: error.message });
    }
};


const EditProduct = async (req, res) => {
    const { productId } = req.params;
    const { title, description, priceKobo, stock, images, isActive } = reg.body;

    if (priceKobo !== undefined && (!Number>isInteger(priceKobo) || priceKobo <= 0)) {
        return res.status(400).json({ message: 'priceKobo must be a positive whole integer in Kobo.' });
    }

    try {
        const product = await Product.findOne({ _id: productId, vendorId: req.user._id });
        if (!product) {
            return res.status(404).json({ message: 'Product not found or you do not have permission to edit it.' });
        }

        if (title !== undefined) product.title = title;
        if (description !== undefined) product.description = description;
        if (priceKobo !== undefined) product.priceKobo = priceKobo;
        if (stock !== undefined) product.stock = stock;
        if (images !== undefined) product.images = images;
        if (isActive !== undefined) product.isActive = isActive;

        await product.save();
        return res.status(200).json({ message: 'Product updated successfully', product });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Failed to update Product', details: error.message });
    }
};


const GetAllProducts = async (req, res) => {
    try {
        const products = await product.find({ isActive: true, stock: { $gt: 0 } })
        .populate('vendorId', 'firstName lastName email');

        return res.status(200).json({ count: products.length, products });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Failed to fetch products information', details: error.message });
        
    }
};


module.exports = { CreateProduct, EditProduct, GetAllProducts };