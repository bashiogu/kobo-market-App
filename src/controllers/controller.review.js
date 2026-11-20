const pool = require("../config/pg");
const Review = require("../models/models.review");



const CreateReview = async (req, res) => {
    const { productId, orderId, rating, comment } = req.body;
    const buyerId = req.user._id.toString();

    if (!productId || !orderId || !rating || !comment) {
        return res.status(400).json({ message: 'productId, orderId, rating, and comment are required.' });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Rating must be a whole integer between 1 and 5.' });
    }

    try {
        const orderQuery = `SELECT id FROM orders WHERE id = $1 AND buyer_id = $2 AND product_id = $3 AND status = 'delivered';`;
        const orderRes = await pool.query(orderQuery, [orderId, buyerId, productId]);

        if (orderRes.rows.length === 0) {
           return res.status(403).json({ message: 'You an only review products from your own delivered orders.' });
        }

        const review = new Review({
            productId,
            buyerId: req.user._id,
            orderId,
            rating,
            comment
        });

        await review.save();
        return res.status(201).json({ message: 'Review submitted successfully', review });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'You have already reviewed this product for this order.' });
        }
        return res.status(500).json({ message: 'Failed to submit review', details: error.message });
    }
};

const GetProductReviews = async (req, res) => {
    const { productId } = req.params;

    try {
        const reviews = await MongoReview.find({ productId })
        .populate('buyerId', 'firstName lastName')
        .sort({ createdAt: -1 });

        let totalRating = 0;
        reviews.forEach(rev => {
            totalRating += rev.rating;
        });

        const averageRating = reviews.length > 0 ? Number((totalRating / reviews.length).toFixed(1)) : 0;
         return res.status(200).json({ count: reviews.length, averageRating, reviews });
    } catch (error) {
         return res.status(500).json({ error: "Failed to fetch product reviews", details: error.message });
    }
};

module.exports = { CreateReview, GetProductReviews };