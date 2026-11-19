import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
    const payload = {
        success: true,
        message: "CollabX API is running successfully",
        timestamp: new Date().toISOString(),
    };

    if (process.env.NODE_ENV !== "production") {
        const mem = process.memoryUsage();
        payload.memory = {
            rssMb: Number((mem.rss / 1024 / 1024).toFixed(2)),
            heapUsedMb: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
            heapTotalMb: Number((mem.heapTotal / 1024 / 1024).toFixed(2)),
            externalMb: Number((mem.external / 1024 / 1024).toFixed(2)),
        };
    }

    res.status(200).json(payload);
});

export default router;
