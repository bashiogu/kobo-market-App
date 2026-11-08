const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { required } = require("joi");

const Schema = mongoose.Schema;

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    roles: {
      type: [String],
      default: ["buyer"],
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
    },
    emailVerificationExpires: {
      type: Date,
    },
    passwordResetToken: {
      type: String,
    },
    passwordResetExpires: {
      type: Date,
    },
    isFrozen: {
      type: Boolean,
      default: false,
    },
    vendorStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
    },
    bankDetails: {
      accountName: {
        type: String,
      },
      accountNumber: {
        type: String,
      },
      bankCode: {
        type: String,
      },
    },
  },
  { timestamps: true, versionKey: false },
);

const User = mongoose.model("User", userSchema);

module.exports = User;
