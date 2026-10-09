# Candidate and Hiring Contact data are kept apart

The CNIL treats reusing recruitment data for commercial prospecting as incompatible with the purpose it was collected for.
A Candidate and a Hiring Contact are therefore separate records even when they are the same human, and they are never linked or cross-referenced.
They live in separate database schemas accessed through separate database roles, so prospecting code physically cannot read Candidate data.
Do not "deduplicate" them.
