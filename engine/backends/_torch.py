"""Shared helpers for PyTorch backends."""
from __future__ import annotations


def device_and_dtype():
    import torch

    if torch.cuda.is_available():
        return "cuda", torch.bfloat16
    return "cpu", torch.float32


def free_cuda() -> None:
    try:
        import gc

        import torch

        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass


def seed_generator(device: str, seed: int | None):
    import torch

    g = torch.Generator(device="cpu" if device == "cpu" else device)
    return g.manual_seed(int(seed)) if seed is not None else g.manual_seed(torch.seed() % (2**32))
