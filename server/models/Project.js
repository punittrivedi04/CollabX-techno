import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            trim: true,
            maxlength: 300,
        },

        name: {
            type: String,
            trim: true,
            maxlength: 300,
        },

        projectTitle: {
            type: String,
            trim: true,
            maxlength: 500,
            default: "",
        },

        description: {
            type: String,
            trim: true,
            maxlength: 3000,
            default: "",
        },

        githubUrl: {
            type: String,
            trim: true,
            default: "",
        },

        demoUrl: {
            type: String,
            trim: true,
            default: "",
        },

        pptUrl: {
            type: String,
            trim: true,
            default: "",
        },

        status: {
            type: String,
            enum: ["Planning", "In Progress", "Completed", "On Hold"],
            default: "In Progress",
        },

        progress: {
            type: Number,
            min: 0,
            max: 100,
            default: 0,
        },

        priority: {
            type: String,
            enum: ["Low", "Medium", "High"],
            default: "Medium",
        },

        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        members: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],

        teamMembers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],

        deadline: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

projectSchema.pre("validate", function (next) {
    if (this.title && !this.name) this.name = this.title;
    if (this.name && !this.title) this.title = this.name;
    if (this.teamMembers?.length && !this.members?.length) this.members = this.teamMembers;
    if (this.members?.length && !this.teamMembers?.length) this.teamMembers = this.members;
    next();
});

// Projects owned by a user, newest first
projectSchema.index({ owner: 1, createdAt: -1 });

// Projects where a user is a member, newest first
projectSchema.index({ members: 1, createdAt: -1 });

const Project = mongoose.model("Project", projectSchema);

export default Project;
