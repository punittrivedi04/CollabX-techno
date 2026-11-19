import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
            minlength: [2, "Name must contain at least 2 characters"],
            maxlength: [100, "Name cannot exceed 100 characters"],
        },

        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            maxlength: 100,
        },

        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: 6,
            select: false,
        },

        role: {
            type: String,
            trim: true,
            maxlength: [50, "Role cannot exceed 50 characters"],
            default: "Member",
        },

        bio: {
            type: String,
            trim: true,
            maxlength: [300, "Bio cannot exceed 300 characters"],
            default: "",
        },

        institution: {
            type: String,
            trim: true,
            maxlength: [100, "Institution cannot exceed 100 characters"],
            default: "Techno NJR Institute of Technology",
        },
    },
    {
        timestamps: true,
    }
);

// Match user-entered password with hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
    if (!this.password) return false;
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;
