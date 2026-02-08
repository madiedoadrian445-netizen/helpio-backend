// src/models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema } = mongoose;

/* ============================================================
   USER SCHEMA — B17 HARDENED
============================================================ */
const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [120, "Name cannot exceed 120 characters"],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [160, "Email cannot exceed 160 characters"],
      validate: {
        validator: (v) =>
          /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@(([^<>()[\]\.,;:\s@"]+\.)+[^<>()[\]\.,;:\s@"]{2,})$/i.test(
            v
          ),
        message: "Invalid email format",
      },
      index: true,
    },

    password: {
      type: String,
      required: true,
      minlength: [6, "Password must be at least 6 characters"],
    },

    role: {
  type: String,
  enum: ["customer", "provider", "admin"], // ✅ corrected
  default: "customer",                     // ✅ correct default
  index: true,
},


    isVerifiedProvider: {
      type: Boolean,
      default: false,
      index: true,
    },

    refreshToken: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

/* ============================================================
   PRE-SAVE NORMALIZATION
============================================================ */
userSchema.pre("save", async function (next) {
  if (this.isModified("email")) {
    this.email = this.email.trim().toLowerCase();
  }

  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

/* ============================================================
   METHODS
============================================================ */
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

/* ============================================================
   VIRTUALS
============================================================ */

// Virtual: isAdmin (maps role === "admin")
userSchema.virtual("isAdmin").get(function () {
  return this.role === "admin";
});

/* ============================================================
   JSON TRANSFORM
============================================================ */
userSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id;

    delete ret.password;
    delete ret.refreshToken;
    delete ret.__v;

    return ret;
  },
});

/* ============================================================
   EXPORTS
============================================================ */
export const User = mongoose.model("User", userSchema);
export default User;
